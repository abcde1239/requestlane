import { expect, test } from 'bun:test'
import axios, { AxiosError, type AxiosResponse } from 'axios'
import { HttpRequest, SessionHttpRequest, BaseService, ServiceError, getData, wrapRequest, checkOk, parseResponse, unwrapResponse, BusinessError, InvalidResponseError, classifyError } from '../src/compat/sends/index.js'
import { fixture, deferred, flush } from './fixtures.js'
import { createClient, defineEndpoint } from '../src/index.js'

test('legacy native metadata/errors and request interceptors remain intact', async () => {
  const f = fixture('axios')
  f.respond({ msg: 'ok', data: { id: 'member' } })
  const config = { adapter: f.adapter, headers: { Authorization: 'Bearer original', post: { authorization: 'Bearer old' } } }
  const http = new HttpRequest(config, async request => { request.headers.set('X-Intercept', 'yes'); return request })
  http.setToken('bearer new')
  const body = { name: 'updated' }
  expect(await getData(http.patch<typeof body, { id: string }>('/member', body, { timeout: 0 }))).toEqual({ id: 'member' })
  expect(JSON.parse(f.requests[0]?.body as string)).toEqual(body)
  expect(f.requests[0]?.headers.Authorization ?? f.requests[0]?.headers.authorization).toBe('Bearer new')
  expect(config.headers.Authorization).toBe('Bearer original')
  const raw: AxiosResponse = await http.requestRaw({ url: '/raw' }); expect(raw.status).toBe(200)
  const failure = new AxiosError('offline', 'ERR_NETWORK'); f.fail(failure)
  await expect(http.get('/offline')).rejects.toBe(failure); expect(axios.isAxiosError(failure)).toBe(true)
  http.clearToken()
})
test('session provider remains authoritative, anonymous skips refresh and session raw validates envelope', async () => {
  const f = fixture('axios'); f.respond({ msg: 'ok', data: false })
  let token = 'provider'; let renewals = 0
  const http = new SessionHttpRequest('/api', { adapter: f.adapter, token: () => token, ensureFreshToken: async () => { renewals++; return token } })
  http.setToken('manual')
  await http.get('/anonymous', { anonymous: true }); expect(renewals).toBe(0)
  await http.get('/data'); expect(f.requests.at(-1)?.headers.Authorization).toBe('Bearer provider')
  token = ''; await http.get('/empty'); expect(f.requests.at(-1)?.headers.Authorization).toBeUndefined()
  f.text('', 204); await expect(http.requestRaw({ url: '/raw' })).rejects.toBeInstanceOf(ServiceError)
  expect(classifyError(new ServiceError('network', 0, undefined, 'network')).kind).toBe('network')
})
test('BaseService supports legacy/session constructors, factory and direct transport composition', async () => {
  const f = fixture('axios'); f.respond({ msg: 'ok', data: 1 })
  class Sample extends BaseService { read() { return getData(this.http.get<number>('/list')) } }
  expect(await new Sample('sample', '/api', { adapter: f.adapter }).read()).toBe(1)
  expect(await new Sample('sample', { baseURL: '/api', adapter: f.adapter }).read()).toBe(1)
  let injected = false
  const service = new Sample('sample', { baseURL: '/api' }, (url) => { injected = true; return new HttpRequest({ baseURL: url, adapter: f.adapter }) })
  expect(await service.read()).toBe(1); expect(injected).toBe(true)
})
test('sends response helpers prioritize codes, preserve falsy data, reject invalid envelopes and checkOk failures', async () => {
  for (const data of [null, false, 0, '', [], {}]) expect(unwrapResponse<typeof data>({ code: 0, msg: '成功', data })).toBe(data)
  expect(parseResponse({ msg: 'denied' })).toEqual({ msg: 'denied' })
  for (const code of ['1001', 999, -1, NaN]) expect(() => parseResponse({ msg: 'ok', data: {}, code })).toThrow(InvalidResponseError)
  expect(() => unwrapResponse({ code: 1999, msg: 'ok', data: {} })).toThrow(BusinessError)
  expect(await checkOk(Promise.resolve({ msg: 'ok', data: null }))).toBe(true)
  await expect(checkOk(Promise.resolve({ msg: 'failed' }))).rejects.toBeInstanceOf(BusinessError)
  expect(await wrapRequest(Promise.resolve({ msg: 'ok', data: 2 }), async response => response.data * 2)).toBe(4)
  const original = new Error('original'); let observers = 0
  await expect(getData(Promise.reject(original), async () => { observers++; throw new Error('observer') })).rejects.toBe(original)
  expect(observers).toBe(1)
})
test('session legacy refresh waiters support cancellation and provider fallback without real network', async () => {
  const f = fixture('axios'); f.respond({ msg: 'ok', data: 1 }); const renewal = deferred<string>()
  const http = new SessionHttpRequest('/api', { adapter: f.adapter, ensureFreshToken: () => renewal.promise })
  const cancel = new AbortController(); const pending = http.get('/wait', { signal: cancel.signal }).catch(error => error)
  await flush(); cancel.abort(); expect(await pending).toMatchObject({ name: 'AbortError' }); expect(f.requests).toHaveLength(0)
  renewal.resolve('fresh')
})
test('plain endpoint definitions and default clients require no sends-specific response', async () => {
  const f = fixture('fetch'); f.respond({ plain: 'json' })
  const endpoint = defineEndpoint({ method: 'GET', path: '/plain' })
  const client = createClient({ transport: f.transport })
  expect(await client.call(endpoint, {})).toMatchObject({ plain: 'json' })
})
