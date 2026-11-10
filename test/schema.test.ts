import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createClient, defineEndpoint, ValidationError } from "@";
import { fixture } from "./fixtures";

for (const kind of ["axios", "fetch"] as const)
  describe(`${kind} Zod integration`, () => {
    test("caches parsed output and preserves the original ZodError without caching invalid data", async () => {
      const f = fixture(kind);
      const client = createClient({ transport: f.transport });
      const schema = z.object({
        value: z.string().transform((value) => Number(value)),
      });
      const endpoint = defineEndpoint({
        method: "GET",
        path: "/schema",
        validator: schema,
        cache: true,
      });
      f.respond({ value: 42 });
      const failure: unknown = await client
        .call(endpoint, {})
        .catch((error) => error);
      expect(failure).toBeInstanceOf(ValidationError);
      expect((failure as ValidationError).cause).toBeInstanceOf(z.ZodError);
      expect(client.cache.size).toBe(0);
      f.respond({ value: "42" });
      expect(await client.call(endpoint, {})).toEqual({ value: 42 });
      expect(await client.call(endpoint, {})).toEqual({ value: 42 });
      expect(f.requests).toHaveLength(2);
      client.dispose();
    });

    test("validates and transforms body before dispatch", async () => {
      const f = fixture(kind);
      const client = createClient({ transport: f.transport });
      const body = z.object({ name: z.string().trim().min(1) });
      const endpoint = defineEndpoint({
        method: "POST",
        path: "/schema",
        inputValidators: { body },
      });
      await expect(
        client.call(endpoint, { body: { name: "  " } }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(f.requests).toHaveLength(0);
      await client.call(endpoint, { body: { name: "  Ada  " } });
      expect(JSON.parse(f.requests[0]?.body as string)).toEqual({
        name: "Ada",
      });
      client.dispose();
    });

    test("accepts async Zod refinements directly and only caches successful output", async () => {
      const f = fixture(kind);
      const client = createClient({ transport: f.transport });
      const schema = z.object({
        value: z.number().refine(async (value) => value > 0),
      });
      const endpoint = defineEndpoint({
        method: "GET",
        path: "/async-schema",
        cache: true,
        validator: schema,
      });
      f.respond({ value: -1 });
      await expect(client.call(endpoint, {})).rejects.toMatchObject({
        kind: "validation",
        cause: expect.any(z.ZodError),
      });
      expect(client.cache.size).toBe(0);
      f.respond({ value: 1 });
      expect(await client.call(endpoint, {})).toEqual({ value: 1 });
      expect(await client.call(endpoint, {})).toEqual({ value: 1 });
      expect(f.requests).toHaveLength(2);
      client.dispose();
    });

    test("infers raw schema inputs and sends transformed params, query and body", async () => {
      const f = fixture(kind);
      const client = createClient({ transport: f.transport });
      const endpoint = defineEndpoint({
        method: "POST",
        path: "/members/:id",
        inputValidators: {
          params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
          query: z.object({ limit: z.string().transform(Number) }),
          body: z.object({
            name: z.string().trim().min(1),
            age: z.string().transform(Number),
          }),
        },
        querySerializer: (query) => `limit=${query.limit.toFixed(0)}`,
        validator: z.object({ value: z.string().transform(Number) }),
      });
      f.respond({ value: "42" });
      expect(
        await client.call(endpoint, {
          params: { id: "007" },
          query: { limit: "10" },
          body: { name: " Ada ", age: "18" },
        }),
      ).toEqual({ value: 42 });
      expect(f.requests[0]?.url).toBe("/members/7?limit=10");
      expect(JSON.parse(f.requests[0]?.body as string)).toEqual({
        name: "Ada",
        age: 18,
      });
      await expect(
        client.call(endpoint, {
          params: { id: "invalid" },
          query: { limit: "10" },
          body: { name: "Ada", age: "18" },
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(f.requests).toHaveLength(1);
      client.dispose();
    });

    test("omitted schema defaults and explicit equivalent inputs share validated cache entries", async () => {
      const f = fixture(kind);
      const client = createClient({ transport: f.transport });
      const endpoint = defineEndpoint({
        method: "GET",
        path: "/defaults",
        inputValidators: {
          query: z.object({ page: z.number() }).default({ page: 1 }),
        },
        cache: true,
      });
      expect(await client.call(endpoint)).toEqual({ value: 1 });
      expect(await client.call(endpoint, { query: { page: 1 } })).toEqual({
        value: 1,
      });
      expect(f.requests).toHaveLength(1);
      expect(f.requests[0]?.url).toBe("/defaults?page=1");
      client.dispose();
    });

    test("accepts async input refinements directly and never dispatches rejected input", async () => {
      const f = fixture(kind);
      const client = createClient({ transport: f.transport });
      const endpoint = defineEndpoint({
        method: "POST",
        path: "/async-input",
        inputValidators: {
          body: z.object({
            name: z.string().refine(async (name) => name === "Ada"),
          }),
        },
      });
      await expect(
        client.call(endpoint, { body: { name: "rejected" } }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(f.requests).toHaveLength(0);
      await client.call(endpoint, { body: { name: "Ada" } });
      expect(f.requests).toHaveLength(1);
      client.dispose();
    });
  });
