import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createClient, defineEndpoint } from "requestlane/core";
import { ReadCache, createMemoryCache } from "requestlane/cache";
import { createSession } from "requestlane/session";
import { fixture, flush, deferred } from "./fixtures";

for (const kind of ["axios", "fetch"] as const) {
  describe(`${kind} independent modules`, () => {
    for (const cache of [false, true])
      for (const session of [false, true]) {
        test(`cache=${cache}, session=${session}: validates, composes and owns resources`, async () => {
          const f = fixture(kind);
          let token = "first";
          let version = 1;
          const client = createClient({
            transport: f.transport,
            cache: cache
              ? createMemoryCache({ ttl: 1000, capacity: 2 })
              : undefined,
            session: session
              ? createSession({
                  token: () => token,
                  sessionVersion: () => version,
                })
              : undefined,
          });
          const endpoint = defineEndpoint({
            method: "GET",
            path: "/modules/:id",
            cache,
            inputValidators: { params: z.object({ id: z.string().min(1) }) },
            validator: z.object({
              value: z.number().refine(async (value) => value > 0),
            }),
          });
          expect(client.cache === undefined).toBe(!cache);
          await expect(
            client.call(endpoint, { params: { id: "" } }),
          ).rejects.toMatchObject({ kind: "validation" });
          expect(f.requests).toHaveLength(0);
          const [first, second] = await Promise.all([
            client.call(endpoint, { params: { id: "1" } }),
            client.call(endpoint, { params: { id: "1" } }),
          ]);
          expect(first).toEqual({ value: 1 });
          expect(second).toEqual(first);
          expect(f.requests).toHaveLength(cache ? 1 : 2);
          expect(f.requests[0]?.headers.authorization).toBe(
            session ? "Bearer first" : undefined,
          );
          if (session) {
            token = "second";
            version++;
            f.respond({ value: 2 });
            expect(
              await client.call(endpoint, { params: { id: "1" } }),
            ).toEqual({ value: 2 });
            expect(f.requests.at(-1)?.headers.authorization).toBe(
              "Bearer second",
            );
          }
          if (cache) {
            await expect(
              client.withInvalidation([], async () => {
                throw new Error("write failed");
              }),
            ).rejects.toThrow("write failed");
            client.invalidate({ endpoint });
            expect(client.cache?.size).toBe(0);
          }
          client.dispose();
          expect(client.cache?.pending ?? 0).toBe(0);
          await expect(client.get("/disposed")).rejects.toMatchObject({
            kind: "cancelled",
          });
        });
      }

    test("minimal requests reject unavailable capabilities and bypass cache explicitly", async () => {
      const f = fixture(kind);
      const client = createClient({ transport: f.transport });
      const endpoint = defineEndpoint({
        method: "GET",
        path: "/requires-cache",
        cache: true,
      });
      await expect(client.call(endpoint)).rejects.toThrow(
        "Cache capability is not configured",
      );
      expect(f.requests).toHaveLength(0);
      expect(await client.call(endpoint, {}, { bypassCache: true })).toEqual({
        value: 1,
      });
      expect(() => client.setToken("token")).toThrow(
        "Session capability is not configured",
      );
      expect(() => client.invalidate()).toThrow(
        "Cache capability is not configured",
      );
      let wrote = false;
      await expect(
        client.withInvalidation([], async () => {
          wrote = true;
        }),
      ).rejects.toThrow("Cache capability is not configured");
      expect(wrote).toBe(false);
      await expect(
        client.get("/token", { sessionToken: "token" }),
      ).rejects.toThrow("Session capability is not configured");
      expect(f.requests).toHaveLength(1);
      client.dispose();
    });

    test("anonymous header protection works without a session implementation", async () => {
      const f = fixture(kind);
      const client = createClient({
        transport: f.transport,
        auth: { header: "X-Api-Key" },
        headers: { Authorization: "secret", "X-Api-Key": "key" },
      });
      await client.get("/public", {
        anonymous: true,
        headers: { AUTHORIZATION: "override", "X-API-KEY": "override-key" },
      });
      const headers = new Headers(f.requests[0]?.headers);
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("x-api-key")).toBe(false);
      client.dispose();
    });

    test("cache-only bypasses unknown credentials, including Authorization with a custom auth header", async () => {
      const f = fixture(kind);
      const client = createClient({
        transport: f.transport,
        cache: createMemoryCache(),
        auth: { header: "X-Api-Key" },
        headers: { Authorization: "untracked" },
      });
      const endpoint = defineEndpoint({
        method: "GET",
        path: "/private",
        cache: true,
      });
      await client.call(endpoint);
      await client.call(endpoint);
      expect(f.requests).toHaveLength(2);
      expect(client.cache?.size).toBe(0);
      client.dispose();
    });

    test("session-only refresh, unauthorized callbacks and cancellation require no cache", async () => {
      const f = fixture(kind);
      let unauthorized = 0;
      let refreshed = 0;
      const client = createClient({
        transport: f.transport,
        session: createSession({
          token: () => "current",
          ensureFreshToken: async () => {
            refreshed++;
            return "current";
          },
          onUnauthorized: () => {
            unauthorized++;
          },
        }),
      });
      f.respond({}, 401);
      await expect(client.get("/401")).rejects.toMatchObject({ status: 401 });
      expect(refreshed).toBe(1);
      expect(unauthorized).toBe(1);
      expect(client.cache).toBeUndefined();
      await expect(
        client.get("/anonymous", { anonymous: true }),
      ).rejects.toMatchObject({ status: 401 });
      expect(unauthorized).toBe(1);
      client.clearToken();
      const held = f.hold();
      const pending = client.get("/pending");
      await flush();
      client.dispose();
      await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
      held.resolve();
    });

    test("combined capabilities isolate cancellation and reject stale identities", async () => {
      const f = fixture(kind);
      let scope = 1;
      const client = createClient({
        transport: f.transport,
        cache: createMemoryCache(),
        session: createSession({
          token: () => `token-${scope}`,
          sessionVersion: () => scope,
        }),
      });
      const endpoint = defineEndpoint({
        method: "GET",
        path: "/shared",
        cache: { tags: ["items"] },
      });
      const held = f.hold();
      const controller = new AbortController();
      const cancelled = client.call(
        endpoint,
        {},
        { signal: controller.signal },
      );
      const survivor = client.call(endpoint);
      await flush();
      controller.abort();
      await expect(cancelled).rejects.toMatchObject({ kind: "cancelled" });
      expect(f.requests).toHaveLength(1);
      expect(f.requests[0]?.signal?.aborted).toBe(false);
      scope++;
      const replacement = client.call(endpoint);
      await expect(survivor).rejects.toMatchObject({ kind: "cancelled" });
      await flush();
      held.resolve();
      expect(await replacement).toEqual({ value: 1 });
      expect(f.requests).toHaveLength(2);
      f.respond({ value: 2 });
      await client.withInvalidation(["items"], () => client.post("/write", {}));
      expect(client.cache?.size).toBe(0);
      expect(await client.call(endpoint)).toEqual({ value: 2 });
      client.dispose();
    });

    test("capability factories create isolated state for each client", async () => {
      const f = fixture(kind);
      const cache = createMemoryCache();
      const session = createSession();
      const first = createClient({ transport: f.transport, cache, session });
      const second = createClient({ transport: f.transport, cache, session });
      const endpoint = defineEndpoint({
        method: "GET",
        path: "/isolated",
        cache: true,
      });
      first.setToken("first");
      second.setToken("second");
      await first.call(endpoint);
      await second.call(endpoint);
      expect(
        f.requests.map((request) => request.headers.authorization),
      ).toEqual(["Bearer first", "Bearer second"]);
      expect(first.cache).not.toBe(second.cache);
      first.dispose();
      expect(await second.call(endpoint)).toEqual({ value: 1 });
      expect(f.requests).toHaveLength(2);
      second.dispose();
    });
  });
}

test("standalone cache stores non-HTTP work and shares only the selected key", async () => {
  const cache = new ReadCache();
  const gate = deferred<number>();
  let calls = 0;
  const loader = async () => {
    calls++;
    return gate.promise;
  };
  const first = cache.get("calculation", loader);
  const second = cache.get("calculation", loader);
  gate.resolve(42);
  expect(await first).toBe(42);
  expect(await second).toBe(42);
  expect(calls).toBe(1);
  cache.clear();
});
