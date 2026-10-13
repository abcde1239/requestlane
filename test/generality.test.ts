import { expect, test } from 'bun:test'
import axios from 'axios'
import { createClient, defineEndpoint } from '@'
import { createAxiosTransport } from '@/adapters/axios'
import { fixture, deferred, flush } from './fixtures'

test('API key and custom token formatter work without Bearer or sends assumptions', async () => {
  const f = fixture('fetch')
  const client = createClient({
    transport: f.transport,
    auth: { header: 'X-Api-Key', format: (value) => value },
  })
  client.setToken('key-one')
  await client.get('/items')
  expect(f.requests[0]?.headers['x-api-key']).toBe('key-one')
  await client.get('/public', { anonymous: true })
  expect(f.requests[1]?.headers['x-api-key']).toBeUndefined()
  client.clearToken()
  await client.get('/clear')
  expect(f.requests[2]?.headers['x-api-key']).toBeUndefined()
  const basic = createClient({
    transport: f.transport,
    auth: { format: (value) => `Basic ${value}` },
  })
  basic.setToken('encoded')
  await basic.get('/basic')
  expect(f.requests.at(-1)?.headers.authorization).toBe('Basic encoded')
})
test('manual set/clear replaces inherited defaults while explicit per-request authorization wins', async () => {
  const f = fixture('fetch')
  const original = { Authorization: 'Bearer stale' }
  const client = createClient({ transport: f.transport, headers: original })
  client.setToken('fresh')
  await client.get('/fresh')
  expect(f.requests.at(-1)?.headers.authorization).toBe('Bearer fresh')
  await client.get('/override', {
    headers: { AUTHORIZATION: 'Basic explicit' },
  })
  expect(f.requests.at(-1)?.headers.authorization).toBe('Basic explicit')
  client.clearToken()
  await client.get('/cleared')
  expect(f.requests.at(-1)?.headers.authorization).toBeUndefined()
  const clearDefault = createClient({
    transport: f.transport,
    headers: original,
  })
  clearDefault.clearToken()
  await clearDefault.get('/default-clear')
  expect(f.requests.at(-1)?.headers.authorization).toBeUndefined()
  expect(original.Authorization).toBe('Bearer stale')
})
test('empty paths preserve base URL and binary views preserve byte offsets', async () => {
  const f = fixture('fetch')
  const client = createClient({ transport: f.transport, baseURL: '/api/user' })
  await client.patch('', { intro: '' })
  expect(f.requests[0]?.url).toBe('/api/user')
  const bytes = new Uint8Array([9, 1, 2, 9])
  await client.post('/bytes', bytes.subarray(1, 3))
  expect(new Uint8Array(f.requests[1]?.body as ArrayBuffer)).toEqual(
    new Uint8Array([1, 2]),
  )
  expect(f.requests[1]?.headers['content-type']).toBe(
    'application/octet-stream',
  )
  await expect(client.get('/date', { query: new Date() })).rejects.toThrow(
    'querySerializer',
  )
})
test('query field order normalizes, tags isolate reads, custom alias can be invalidated', async () => {
  const f = fixture('fetch')
  const client = createClient({ transport: f.transport })
  const a = defineEndpoint<{ query: { a: number; b: number }; data: unknown }>({
    method: 'GET',
    path: '/order',
    cache: { key: () => 'custom', tags: ['first'] },
  })
  const b = defineEndpoint({
    method: 'GET',
    path: '/other',
    cache: { tags: ['second'] },
  })
  await client.call(a, { query: { a: 1, b: 2 } })
  await client.call(a, { query: { b: 2, a: 1 } })
  await client.call(b, {})
  expect(f.requests).toHaveLength(2)
  client.invalidate({ key: 'custom' })
  await client.call(a, { query: { a: 1, b: 2 } })
  await client.call(b, {})
  expect(f.requests).toHaveLength(3)
  client.invalidate({ tag: 'first' })
  await client.call(b, {})
  expect(f.requests).toHaveLength(3)
})
test('unobservable injected Axios interceptors bypass caches unless the host declares stability', async () => {
  const f = fixture('axios')
  const instance = axios.create({ adapter: f.adapter })
  instance.interceptors.request.use((config) => {
    config.headers.set('X-Dynamic', String(Math.random()))
    return config
  })
  const client = createClient({
    transport: createAxiosTransport({ instance }),
  })
  const endpoint = defineEndpoint({
    method: 'GET',
    path: '/dynamic',
    cache: true,
  })
  await client.call(endpoint, {})
  await client.call(endpoint, {})
  expect(f.requests).toHaveLength(2)
  expect(client.cache.size).toBe(0)
})
test('credential/representation variants cannot reuse a cache key, unsupported Axios omission rejects', async () => {
  const f = fixture('fetch')
  const client = createClient({ transport: f.transport })
  const endpoint = defineEndpoint({
    method: 'GET',
    path: '/variants',
    cache: true,
  })
  await client.call(endpoint, {}, { credentials: 'include' })
  await client.call(endpoint, {}, { credentials: 'same-origin' })
  await client.call(endpoint, {}, { headers: { 'accept-language': 'en' } })
  expect(f.requests).toHaveLength(3)
  const axiosFixture = fixture('axios')
  await expect(
    createClient({ transport: axiosFixture.transport }).get('/omit', {
      credentials: 'omit',
    }),
  ).rejects.toThrow('Axios cannot guarantee')
})
test('session switch during async validator blocks old data, renewal with provider ignores manual mutation', async () => {
  const f = fixture('fetch')
  let token = 'one'
  let version = 1
  const pending = deferred<number>()
  const client = createClient({
    transport: f.transport,
    session: { token: () => token, sessionVersion: () => version },
  })
  const endpoint = defineEndpoint({
    method: 'GET',
    path: '/validation',
    cache: true,
    validator: { parse: () => pending.promise },
  })
  const old = client.call(endpoint, {}).catch((error) => error)
  await flush()
  token = 'two'
  version++
  pending.resolve(1)
  expect(await old).toMatchObject({ name: 'AbortError' })
  expect(client.cache.size).toBe(0)
  const next = defineEndpoint({ method: 'GET', path: '/next', cache: true })
  await client.call(next, {})
  client.setToken('ignored')
  await client.call(next, {})
  expect(f.requests).toHaveLength(2)
})
