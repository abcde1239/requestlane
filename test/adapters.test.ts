import { describe, expect, test } from 'bun:test'
import axios, { AxiosError } from 'axios'
import { createClient, defineEndpoint, createCodec, BusinessError, classifyError, InvalidResponseError } from '../src/index.js'
import { createAxiosTransport } from '../src/adapters/axios.js'
import { createFetchTransport } from '../src/adapters/fetch.js'
import { createSendsCodec, sendsCodec } from '../src/response/sends.js'
import { fixture } from './fixtures.js'

for (const kind of ['axios', 'fetch'] as const) describe(`${kind} common contracts`, () => {
  test('serializes path/query/body and preserves caller configuration', async () => {
    const f = fixture(kind)
    const headers = { 'X-Input': 'original' }
    const client = createClient({ transport: f.transport, baseURL: 'https://example.test/api', headers: { 'X-Input': 'default' } })
    const response = await client.requestRaw<{ value: number }>({ url: '/item/:id', method: 'PATCH', params: { id: 'a/b 中文' }, query: { z: undefined, n: null, a: [2, 1], b: false, c: 0, d: '' }, body: { value: false }, headers })
    expect(f.requests[0]?.url).toBe('https://example.test/api/item/a%2Fb%20%E4%B8%AD%E6%96%87?a=2&a=1&b=false&c=0&d=&n=')
    expect(JSON.parse(f.requests[0]?.body as string)).toEqual({ value: false })
    expect(f.requests[0]?.headers['x-input']).toBe('original')
    expect(headers).toEqual({ 'X-Input': 'original' })
    expect(response.headers['x-trace']).toBe('trace')
    expect(response.data).toEqual({ value: 1 })
  })
  test('supports all public methods, custom query serializer, text and empty responses', async () => {
    const f = fixture(kind)
    const client = createClient({ transport: f.transport })
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const) await client.requestRaw({ url: '/methods', method })
    expect(f.requests.map(request => request.method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    f.text('plain')
    expect(await client.get<string>('/text', { responseType: 'text' })).toBe('plain')
    f.respond({})
    await client.get('/query', { query: { nested: {} }, querySerializer: () => 'x=custom' })
    expect(f.requests.at(-1)?.url).toBe('/query?x=custom')
    f.text('', 204)
    expect((await client.requestRaw({ url: '/empty' })).data).toBeUndefined()
    await expect(client.requestEnvelope({ url: '/empty' }, sendsCodec)).rejects.toBeInstanceOf(InvalidResponseError)
  })
  test('decodes binary response types and passes native bodies without JSON wrapping', async () => {
    const f = fixture(kind)
    const client = createClient({ transport: f.transport })
    f.bytes(new Uint8Array([1, 2, 3]))
    expect(new Uint8Array(await client.get<ArrayBuffer>('/bytes', { responseType: 'arraybuffer' }))).toEqual(new Uint8Array([1, 2, 3]))
    expect(new Uint8Array(await (await client.get<Blob>('/blob', { responseType: 'blob' })).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    f.respond({})
    const body = new URLSearchParams({ a: 'b' })
    await client.post('/form', body)
    expect(f.requests.at(-1)?.body).toBe('a=b')
    expect(f.requests.at(-1)?.headers['content-type'] ?? f.requests.at(-1)?.headers['Content-Type']).toBe('application/x-www-form-urlencoded;charset=UTF-8')
    const form = new FormData(); form.set('a', 'b')
    await client.post('/multipart', form)
    expect(f.requests.at(-1)?.body).toBe(form)
    const contentType = f.requests.at(-1)?.headers['content-type']
    expect(contentType === undefined || !contentType.includes('application/json')).toBe(true)
  })
  test('preserves non-JSON HTTP errors and classifies invalid successful JSON', async () => {
    const f = fixture(kind)
    const client = createClient({ transport: f.transport })
    for (const status of [401, 403, 503]) {
      f.text('<html>failure</html>', status)
      try { await client.get('/error'); throw new Error('expected error') }
      catch (error) { expect(classifyError(error)).toMatchObject({ kind: 'http', status }); expect((error as { response: { data: unknown } }).response.data).toBe('<html>failure</html>') }
    }
    f.text('{broken')
    await expect(client.get('/invalid')).rejects.toBeInstanceOf(InvalidResponseError)
    f.fail(new TypeError('offline'))
    await expect(client.get('/offline')).rejects.toMatchObject({ kind: 'network', cause: expect.any(TypeError) })
  })
  test('supports custom envelopes, data validation and codec-specific failure rules', async () => {
    const f = fixture(kind)
    const codec = createCodec<{ success: boolean; result: unknown }>({
      parse(value) { if (!value || typeof value !== 'object' || !('success' in value)) throw new Error('bad'); return value as { success: boolean; result: unknown } },
      unwrap(value) { if (!value.success) throw new BusinessError(value, 'denied'); return value.result }
    })
    const client = createClient({ transport: f.transport, codec })
    const endpoint = defineEndpoint({ method: 'GET', path: '/custom', validator: { parse(value: unknown) { if (typeof value !== 'number') throw new Error('number expected'); return value * 2 } } })
    f.respond({ success: true, result: 3 })
    expect(await client.call(endpoint, {})).toBe(6)
    f.respond({ success: false })
    expect(await client.requestEnvelope<{ success: boolean }>({ url: '/custom' })).toEqual({ success: false })
    await expect(client.get('/custom')).rejects.toBeInstanceOf(BusinessError)
    f.respond({ success: true, result: 'wrong' })
    await expect(client.call(endpoint, {})).rejects.toMatchObject({ kind: 'validation' })
    const sends = createSendsCodec({ 1001: { status: 400 } })
    f.respond({ code: 1001, msg: 'rejected' })
    await expect(client.requestData({ url: '/sends' }, sends)).rejects.toMatchObject({ status: 200, businessCode: 1001, suggestedStatus: 400 })
  })
  test('never dispatches invalid inputs and observes the original error once', async () => {
    const f = fixture(kind)
    const client = createClient({ transport: f.transport })
    const endpoint = defineEndpoint<{ body: { name: string }; data: unknown }>({ method: 'POST', path: '/write', inputValidators: { body: { parse() { throw new Error('invalid') } } } })
    let observed: unknown; let calls = 0
    const caught = await client.call(endpoint, { body: { name: 'x' } }, { onError(error) { observed = error; calls++; throw new Error('observer') } }).catch(error => error)
    expect(caught).toBe(observed)
    expect(calls).toBe(1); expect(f.requests).toHaveLength(0)
    await expect(client.get('/missing/:id')).rejects.toBeInstanceOf(TypeError)
    await expect(client.get('/nested', { query: { nested: {} } })).rejects.toBeInstanceOf(TypeError)
    await expect(client.requestData({ url: '/get-body', method: 'GET', body: {} })).rejects.toBeInstanceOf(TypeError)
    expect(f.requests).toHaveLength(0)
  })
})

test('native entries retain native identities and Fetch does not reinterpret status', async () => {
  const failure = new AxiosError('native error', 'ERR_NETWORK')
  const instance = axios.create({ adapter: async () => { throw failure } })
  const transport = createAxiosTransport({ instance })
  await expect(transport.native.get('/native')).rejects.toBe(failure)
  const f = fixture('fetch'); f.text('denied', 401)
  const fetchTransport = createFetchTransport({ fetcher: f.fetcher })
  expect((await fetchTransport.native('/native')).status).toBe(401)
})

test('injected Axios defaults cannot restore anonymous Authorization or duplicate default params', async () => {
  const f = fixture('axios')
  const instance = axios.create({ adapter: f.adapter, headers: { Authorization: 'Bearer stale' }, params: { secret: 'default' } })
  const client = createClient({ transport: createAxiosTransport({ instance }), session: { token: () => 'fresh' } })
  await client.get('/anonymous', { anonymous: true })
  expect(f.requests[0]?.headers.authorization).toBeUndefined()
  expect(f.requests[0]?.url).toBe('/anonymous')
  expect(instance.defaults.headers.common).toBeDefined()
})
