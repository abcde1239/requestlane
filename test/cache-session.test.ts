import { describe, expect, test } from "bun:test";
import {
  createClient,
  defineEndpoint,
  requestLifetime,
  raceSignal,
  cancelled,
} from "@";
import { ReadCache } from "@/cache/index";
import { fixture, deferred, flush } from "./fixtures";

const read = () =>
  defineEndpoint<{ query: { page: number }; data: { value: number } }>({
    method: "GET",
    path: "/list",
    cache: { tags: ["items"] },
  });
for (const kind of ["axios", "fetch"] as const)
  describe(`${kind} cache and sessions`, () => {
    test("defaults to no response cache and opt-in merges ten concurrent reads", async () => {
      const f = fixture(kind);
      const client = createClient({ transport: f.transport });
      await client.get("/list");
      await client.get("/list");
      expect(f.requests).toHaveLength(2);
      const endpoint = read();
      await Promise.all(
        Array.from({ length: 10 }, () =>
          client.call(endpoint, { query: { page: 1 } }),
        ),
      );
      await client.call(endpoint, { query: { page: 1 } });
      expect(f.requests).toHaveLength(3);
      await client.call(endpoint, { query: { page: 2 } });
      expect(f.requests).toHaveLength(4);
      await client.call(read(), { query: { page: 1 } });
      expect(f.requests).toHaveLength(5);
      await client.call(
        endpoint,
        { query: { page: 1 } },
        { bypassCache: true },
      );
      expect(f.requests).toHaveLength(6);
      await client.call(endpoint, { query: { page: 1 } });
      expect(f.requests).toHaveLength(6);
      client.invalidate({ endpoint });
      await client.call(endpoint, { query: { page: 1 } });
      expect(f.requests).toHaveLength(7);
    });
    test("one reader may cancel without killing the shared request", async () => {
      const f = fixture(kind);
      const gate = f.hold();
      const client = createClient({ transport: f.transport });
      const endpoint = read();
      const first = new AbortController();
      const a = client
        .call(endpoint, { query: { page: 1 } }, { signal: first.signal })
        .catch((error) => error);
      const b = client.call(endpoint, { query: { page: 1 } });
      await flush();
      expect(f.requests).toHaveLength(1);
      first.abort();
      expect(await a).toMatchObject({ name: "AbortError" });
      expect(f.requests[0]?.signal?.aborted).toBe(false);
      gate.resolve();
      expect(await b).toEqual({ value: 1 });
      await client.call(endpoint, { query: { page: 1 } });
      expect(f.requests).toHaveLength(1);
    });
    test("invalidating a tag aborts shared readers and late data cannot replace fresh data", async () => {
      const f = fixture(kind);
      const gate = f.hold();
      const client = createClient({ transport: f.transport });
      const endpoint = read();
      const old = client
        .call(endpoint, { query: { page: 1 } })
        .catch((error) => error);
      await flush();
      client.invalidate({ tag: "items" });
      expect(await old).toMatchObject({ name: "AbortError" });
      f.respond({ value: 2 });
      gate.resolve();
      await flush();
      expect(await client.call(endpoint, { query: { page: 1 } })).toEqual({
        value: 2,
      });
      expect(f.requests).toHaveLength(2);
    });
    test("last consumer cancellation and transport timeout allow a new request", async () => {
      const f = fixture(kind);
      const gate = f.hold();
      const client = createClient({ transport: f.transport });
      const endpoint = defineEndpoint<{ data: unknown }>({
        method: "GET",
        path: "/pending",
        cache: { transportTimeout: 10 },
      });
      const cancelledRead = new AbortController();
      const a = client
        .call(endpoint, {}, { signal: cancelledRead.signal })
        .catch((error) => error);
      await flush();
      cancelledRead.abort();
      expect(await a).toMatchObject({ name: "AbortError" });
      expect(f.requests[0]?.signal?.aborted).toBe(true);
      const b = client.call(endpoint, {}).catch((error) => error);
      expect(await b).toMatchObject({ kind: "timeout" });
      gate.resolve();
      await flush();
      await client.call(endpoint, {});
      expect(f.requests).toHaveLength(3);
    });
    test("failed validation is never cached and writes invalidate before dispatch and finally", async () => {
      const f = fixture(kind);
      const client = createClient({ transport: f.transport });
      const endpoint = defineEndpoint({
        method: "GET",
        path: "/validate",
        cache: { tags: ["items"] },
        validator: {
          parse(value: unknown) {
            if (
              !value ||
              typeof value !== "object" ||
              !("value" in value) ||
              typeof value.value !== "number"
            )
              throw new Error("bad");
            return value.value;
          },
        },
      });
      f.respond({ value: "bad" });
      await expect(client.call(endpoint, {})).rejects.toMatchObject({
        kind: "validation",
      });
      f.respond({ value: 1 });
      expect(await client.call(endpoint, {})).toBe(1);
      expect(f.requests).toHaveLength(2);
      await expect(
        client.withInvalidation(["items"], async () => {
          expect(client.cache.size).toBe(0);
          await client.call(endpoint, {});
          throw new Error("write failed");
        }),
      ).rejects.toThrow("write failed");
      expect(client.cache.size).toBe(0);
    });
    test("dynamic tokens, anonymous requests, manual fallback and same-identity renewal", async () => {
      const f = fixture(kind);
      let token = "first";
      let version = 1;
      let renewals = 0;
      const client = createClient({
        transport: f.transport,
        session: {
          token: () => token,
          sessionVersion: () => version,
          ensureFreshToken: async () => {
            renewals++;
            return token;
          },
        },
      });
      client.setToken("manual");
      await client.get("/anonymous", { anonymous: true });
      expect(f.requests[0]?.headers.authorization).toBeUndefined();
      expect(renewals).toBe(0);
      await client.get("/override", { sessionToken: "override" });
      expect(f.requests[1]?.headers.authorization).toBe("Bearer override");
      expect(renewals).toBe(0);
      const endpoint = read();
      await client.call(endpoint, { query: { page: 1 } });
      expect(f.requests[2]?.headers.authorization).toBe("Bearer first");
      token = "renewed";
      await client.call(endpoint, { query: { page: 1 } });
      expect(f.requests).toHaveLength(3);
      token = "another";
      version++;
      await client.call(endpoint, { query: { page: 1 } });
      expect(f.requests).toHaveLength(4);
      token = "";
      await client.get("/empty-provider");
      expect(f.requests.at(-1)?.headers.authorization).toBeUndefined();
      const manual = createClient({ transport: f.transport, session: {} });
      manual.setToken("bearer fallback");
      await manual.get("/fallback");
      expect(f.requests.at(-1)?.headers.authorization).toBe("Bearer fallback");
      manual.clearToken();
      await manual.get("/cleared");
      expect(f.requests.at(-1)?.headers.authorization).toBeUndefined();
    });
    test("refresh waiters cancel independently and changed sessions block reads and writes", async () => {
      const f = fixture(kind);
      const renewal = deferred<string>();
      let token = "old";
      let version = 1;
      const client = createClient({
        transport: f.transport,
        session: {
          token: () => token,
          sessionVersion: () => version,
          ensureFreshToken: () => renewal.promise,
        },
      });
      const aController = new AbortController();
      const a = client
        .get("/cancel", { signal: aController.signal })
        .catch((error) => error);
      const b = client.get("/survivor");
      await flush();
      aController.abort();
      expect(await a).toMatchObject({ name: "AbortError" });
      expect(f.requests).toHaveLength(0);
      token = "fresh";
      renewal.resolve(token);
      await b;
      expect(f.requests).toHaveLength(1);
      const gate = f.hold();
      const late = client.post("/write", {}).catch((error) => error);
      await flush();
      version++;
      token = "new-account";
      gate.resolve();
      expect(await late).toMatchObject({ name: "AbortError" });
    });
    test("current 401 callbacks exclude anonymous, old sessions, 403 and 503", async () => {
      const f = fixture(kind);
      let token = "current";
      let version = 1;
      let unauthorized = 0;
      const client = createClient({
        transport: f.transport,
        session: {
          token: () => token,
          sessionVersion: () => version,
          onUnauthorized: () => {
            unauthorized++;
          },
        },
      });
      for (const status of [403, 503]) {
        f.text("denied", status);
        await expect(client.get("/error")).rejects.toMatchObject({ status });
      }
      expect(unauthorized).toBe(0);
      f.text("denied", 401);
      await expect(
        client.get("/anon", { anonymous: true }),
      ).rejects.toMatchObject({ status: 401 });
      expect(unauthorized).toBe(0);
      await expect(client.get("/current")).rejects.toMatchObject({
        status: 401,
      });
      expect(unauthorized).toBe(1);
      const gate = f.hold();
      const old = client.get("/late").catch((error) => error);
      await flush();
      token = "new";
      version++;
      gate.resolve();
      expect(await old).toMatchObject({ name: "AbortError" });
      expect(unauthorized).toBe(1);
    });
    test("timeouts cover refresh and async validation; pre-cancel and dispose never dispatch", async () => {
      const f = fixture(kind);
      const never = deferred<string>();
      const waiting = createClient({
        transport: f.transport,
        session: { ensureFreshToken: () => never.promise },
      });
      await expect(waiting.get("/wait", { timeout: 5 })).rejects.toMatchObject({
        kind: "timeout",
      });
      expect(f.requests).toHaveLength(0);
      const client = createClient({ transport: f.transport });
      const endpoint = defineEndpoint({
        method: "GET",
        path: "/validate",
        validator: { parse: () => never.promise },
      });
      await expect(
        client.call(endpoint, {}, { timeout: 5 }),
      ).rejects.toMatchObject({ kind: "timeout" });
      const pre = new AbortController();
      pre.abort();
      await expect(
        client.get("/pre", { signal: pre.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(f.requests).toHaveLength(1);
      const gate = f.hold();
      const pending = client
        .get("/dispose", { timeout: 0 })
        .catch((error) => error);
      await flush();
      client.dispose();
      expect(await pending).toMatchObject({ name: "AbortError" });
      gate.resolve();
      never.resolve("late");
      await expect(client.get("/disposed")).rejects.toMatchObject({
        name: "AbortError",
      });
    });
    test("cache refuses missing provider identity and bypasses explicit auth variants", async () => {
      const f = fixture(kind);
      const endpoint = read();
      const missing = createClient({
        transport: f.transport,
        session: { token: () => "token" },
      });
      await expect(
        missing.call(endpoint, { query: { page: 1 } }),
      ).rejects.toThrow("sessionVersion");
      const client = createClient({ transport: f.transport });
      for (let i = 0; i < 2; i++)
        await client.call(
          endpoint,
          { query: { page: 1 } },
          { headers: { Authorization: "Bearer custom" } },
        );
      expect(f.requests).toHaveLength(2);
      expect(client.cache.size).toBe(0);
      await client.call(endpoint, { query: { page: 1 } }, { timeout: 0 });
      await client.call(endpoint, { query: { page: 1 } }, { timeout: 500 });
      expect(f.requests).toHaveLength(4);
    });
  });

test("FIFO capacity, zero TTL, failure removal, configuration checks and instance isolation", async () => {
  const cache = new ReadCache(0, 2);
  let count = 0;
  const load = async () => ++count;
  expect(
    await Promise.all([cache.get("a", load), cache.get("a", load)]),
  ).toEqual([1, 1]);
  await cache.get("a", load);
  expect(count).toBe(2);
  const bounded = new ReadCache(1000, 2);
  await bounded.get("a", load);
  await bounded.get("b", load);
  await bounded.get("a", load);
  await bounded.get("c", load);
  await bounded.get("a", load);
  expect(count).toBe(6);
  expect(bounded.size).toBe(2);
  await new ReadCache().get("a", load);
  expect(count).toBe(7);
  await expect(
    bounded.get("failed", async () => {
      throw new Error("failed");
    }),
  ).rejects.toThrow("failed");
  expect(await bounded.get("failed", async () => "success")).toBe("success");
  for (const ttl of [-1, NaN, Infinity])
    expect(() => new ReadCache(ttl)).toThrow();
  for (const capacity of [0, -1, 1.5])
    expect(() => new ReadCache(1, capacity)).toThrow();
});
test("TTL begins after successful load, including validation, then expires", async () => {
  const cache = new ReadCache(15);
  const pending = deferred<number>();
  const first = cache.get("a", () => pending.promise);
  await Bun.sleep(20);
  pending.resolve(1);
  await first;
  expect(await cache.get("a", async () => 2)).toBe(1);
  await Bun.sleep(20);
  expect(await cache.get("a", async () => 2)).toBe(2);
});
test("clear includes evicted in-flight entries and old rejection cannot delete a replacement", async () => {
  const cache = new ReadCache(1000, 1);
  const pending = deferred<number>();
  const old = cache.get("old", () => pending.promise).catch((error) => error);
  await flush();
  await cache.get("new", async () => 2);
  cache.clear();
  expect(await old).toMatchObject({ name: "AbortError" });
  await cache.get("old", async () => 3);
  pending.reject(new Error("obsolete"));
  await flush();
  expect(await cache.get("old", async () => 4)).toBe(3);
  expect(cache.pending).toBe(0);
});
test("a loader that ignores abort does not retain active cache bookkeeping after all readers cancel", async () => {
  const cache = new ReadCache();
  const controller = new AbortController();
  const old = cache
    .get("ignored", () => new Promise<never>(() => {}), controller.signal)
    .catch((error) => error);
  await flush();
  controller.abort();
  expect(await old).toMatchObject({ name: "AbortError" });
  await flush();
  expect(cache.pending).toBe(0);
  expect(cache.size).toBe(0);
});
test("lifecycle cancellation and disposal remove listeners; timeout=0 disables deadline", async () => {
  const source = new AbortController();
  let adds = 0;
  let removes = 0;
  const add = source.signal.addEventListener.bind(source.signal);
  const remove = source.signal.removeEventListener.bind(source.signal);
  source.signal.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    adds++;
    return add(type, listener, options);
  };
  source.signal.removeEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => {
    removes++;
    return remove(type, listener, options);
  };
  const lifetime = requestLifetime({ signal: source.signal, timeout: 0 });
  const pending = raceSignal(new Promise(() => {}), lifetime.signal).catch(
    (error) => error,
  );
  source.abort(cancelled());
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(lifetime.timedOut).toBe(false);
  lifetime.dispose();
  expect(adds).toBe(removes);
});
