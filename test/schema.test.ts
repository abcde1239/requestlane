import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { createClient, defineEndpoint, ValidationError } from '../src/index.js'
import { fixture } from './fixtures.js'

for (const kind of ['axios', 'fetch'] as const) describe(`${kind} Zod integration`, () => {
  test('caches parsed output and preserves the original ZodError without caching invalid data', async () => {
    const f = fixture(kind)
    const client = createClient({ transport: f.transport })
    const schema = z.object({ value: z.string().transform(value => Number(value)) })
    const endpoint = defineEndpoint({ method: 'GET', path: '/schema', validator: schema, cache: true })
    f.respond({ value: 42 })
    const failure: unknown = await client.call(endpoint, {}).catch(error => error)
    expect(failure).toBeInstanceOf(ValidationError)
    expect((failure as ValidationError).cause).toBeInstanceOf(z.ZodError)
    expect(client.cache.size).toBe(0)
    f.respond({ value: '42' })
    expect(await client.call(endpoint, {})).toEqual({ value: 42 })
    expect(await client.call(endpoint, {})).toEqual({ value: 42 })
    expect(f.requests).toHaveLength(2)
    client.dispose()
  })

  test('validates and transforms body before dispatch', async () => {
    const f = fixture(kind)
    const client = createClient({ transport: f.transport })
    const body = z.object({ name: z.string().trim().min(1) })
    const endpoint = defineEndpoint<{ body: z.output<typeof body>; data: unknown }>({
      method: 'POST', path: '/schema', inputValidators: { body }
    })
    await expect(client.call(endpoint, { body: { name: '  ' } })).rejects.toBeInstanceOf(ValidationError)
    expect(f.requests).toHaveLength(0)
    await client.call(endpoint, { body: { name: '  Ada  ' } })
    expect(JSON.parse(f.requests[0]?.body as string)).toEqual({ name: 'Ada' })
    client.dispose()
  })

  test('supports async Zod refinements through parseAsync and only caches successful output', async () => {
    const f = fixture(kind)
    const client = createClient({ transport: f.transport })
    const schema = z.object({ value: z.number().refine(async value => value > 0) })
    const endpoint = defineEndpoint({
      method: 'GET', path: '/async-schema', cache: true,
      validator: { parse: (value: unknown) => schema.parseAsync(value) }
    })
    f.respond({ value: -1 })
    await expect(client.call(endpoint, {})).rejects.toMatchObject({ kind: 'validation', cause: expect.any(z.ZodError) })
    expect(client.cache.size).toBe(0)
    f.respond({ value: 1 })
    expect(await client.call(endpoint, {})).toEqual({ value: 1 })
    expect(await client.call(endpoint, {})).toEqual({ value: 1 })
    expect(f.requests).toHaveLength(2)
    client.dispose()
  })
})
