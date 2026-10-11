import type {
  CachePolicy, Endpoint, EndpointData, EndpointInput, EndpointSpec, ReadonlyData,
  RequestConfig, RequestOptions, ResponseCodec, SessionOptions, Transport, TransportResponse
} from './types.js'
import { mergeHeaders, requestBody, requestURL } from './serialization.js'
import { ReadCache, checkTTL } from '../cache/index.js'
import { identityCodec, parseEnvelope, validate } from '../response/codec.js'
import { BusinessError, CommunicationError, HttpError, InvalidResponseError, cancelled, normalizeError } from '../response/errors.js'
import { bearerToken, checkTimeout, raceSignal, requestLifetime } from '../request/lifecycle.js'

export interface ClientOptions {
  transport: Transport
  baseURL?: string
  headers?: Readonly<Record<string, string>>
  timeout?: number
  credentials?: RequestCredentials
  codec?: ResponseCodec
  session?: SessionOptions
  /** 默认 Bearer/Authorization；可用于 Basic、API key 或其他认证方案。 */
  auth?: { header?: string; format?: (token: string) => string }
  cache?: { capacity?: number; ttl?: number }
  beforeRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
  onError?: (error: unknown) => void | Promise<void>
}
export class Client {
  readonly cache: ReadCache
  private readonly options: ClientOptions
  private manualToken = ''
  private generation = 0
  private disposed = false
  private lifetimes = new Set<AbortController>()
  private observedScope: string | number | undefined
  constructor(options: ClientOptions) {
    checkTimeout(options.timeout ?? 15000)
    this.options = { ...options, headers: { ...options.headers }, session: options.session ? { ...options.session } : undefined }
    this.cache = new ReadCache(options.cache?.ttl ?? 30000, options.cache?.capacity ?? 20)
    this.observedScope = options.session?.sessionVersion?.()
  }
  setToken(token: string): void {
    const old = this.formatToken(this.manualToken)
    const normalized = this.formatToken(token)
    this.manualToken = token
    if (!this.options.session?.token) {
      const headers = mergeHeaders(this.options.headers)
      const hadDefault = headers[this.authHeader] !== undefined || headers.authorization !== undefined
      delete headers[this.authHeader]; delete headers.authorization
      this.options.headers = headers
      if (normalized !== old || hadDefault) { this.generation++; this.cache.clear() }
    }
  }
  private get authHeader(): string { return (this.options.auth?.header ?? 'authorization').toLowerCase() }
  private formatToken(token: string): string { return token.trim() ? (this.options.auth?.format ?? bearerToken)(token) : '' }
  clearToken(): void { this.setToken('') }
  invalidate(filter: { key?: string; tag?: string; endpoint?: { readonly identity: number } } = {}): void {
    this.cache.invalidate({ key: filter.key, tag: filter.tag, prefix: filter.endpoint ? `${filter.endpoint.identity}|` : undefined })
  }
  dispose(): void {
    this.disposed = true; this.generation++; this.cache.clear()
    for (const controller of this.lifetimes) controller.abort(cancelled())
    this.lifetimes.clear()
  }
  async withInvalidation<T>(tags: readonly string[], write: () => Promise<T>): Promise<T> {
    const clear = () => { for (const tag of tags) this.invalidate({ tag }) }
    clear()
    try { return await write() } finally { clear() }
  }
  requestRaw<Data = unknown, Body = unknown, Query = unknown, Params = unknown>(config: RequestConfig<Body, Query, Params>): Promise<TransportResponse<Data>> {
    return this.execute(config as RequestConfig, 'raw') as Promise<TransportResponse<Data>>
  }
  requestEnvelope<Envelope = unknown, Body = unknown, Query = unknown, Params = unknown>(config: RequestConfig<Body, Query, Params>, codec = this.options.codec ?? identityCodec): Promise<Envelope> {
    return this.execute(config as RequestConfig, 'envelope', codec) as Promise<Envelope>
  }
  requestData<Data = unknown, Body = unknown, Query = unknown, Params = unknown>(config: RequestConfig<Body, Query, Params>, codec = this.options.codec ?? identityCodec): Promise<Data> {
    return this.execute(config as RequestConfig, 'data', codec) as Promise<Data>
  }
  get<Data = unknown, Query = unknown>(url: string, config: Omit<RequestConfig<never, Query>, 'url' | 'method' | 'body'> = {}): Promise<Data> {
    return this.requestData({ ...config, url, method: 'GET' })
  }
  post<Data = unknown, Body = unknown, Query = unknown>(url: string, body?: Body, config: Omit<RequestConfig<Body, Query>, 'url' | 'method' | 'body'> = {}): Promise<Data> {
    return this.requestData({ ...config, url, method: 'POST', body })
  }
  put<Data = unknown, Body = unknown, Query = unknown>(url: string, body?: Body, config: Omit<RequestConfig<Body, Query>, 'url' | 'method' | 'body'> = {}): Promise<Data> { return this.requestData({ ...config, url, method: 'PUT', body }) }
  patch<Data = unknown, Body = unknown, Query = unknown>(url: string, body?: Body, config: Omit<RequestConfig<Body, Query>, 'url' | 'method' | 'body'> = {}): Promise<Data> { return this.requestData({ ...config, url, method: 'PATCH', body }) }
  delete<Data = unknown, Query = unknown>(url: string, config: Omit<RequestConfig<never, Query>, 'url' | 'method' | 'body'> = {}): Promise<Data> { return this.requestData({ ...config, url, method: 'DELETE' }) }
  head(url: string, config: RequestOptions = {}): Promise<TransportResponse> { return this.requestRaw({ ...config, url, method: 'HEAD' }) }
  call<S extends EndpointSpec>(endpoint: Endpoint<S>, input: EndpointInput<S>, options: RequestOptions = {}): Promise<ReadonlyData<EndpointData<S>>> {
    const spec = endpoint.options
    const config: RequestConfig = { url: spec.path, method: spec.method, timeout: spec.timeout, anonymous: spec.anonymous, responseType: spec.responseType, ...input, ...options, querySerializer: spec.querySerializer as ((query: unknown) => string) | undefined }
    // endpoint 的精确类型只在公开边界使用，内部统一为 unknown。
    return this.execute(config, 'data', spec.codec ?? this.options.codec ?? identityCodec, endpoint as unknown as Endpoint<EndpointSpec>) as Promise<ReadonlyData<EndpointData<S>>>
  }
  private async execute(config: RequestConfig, mode: 'raw' | 'envelope' | 'data', codec = identityCodec, endpoint?: Endpoint<EndpointSpec>): Promise<unknown> {
    if (this.disposed) throw cancelled()
    checkTimeout(config.timeout ?? this.options.timeout ?? 15000)
    const controller = new AbortController()
    this.lifetimes.add(controller)
    const lifetime = requestLifetime({ signal: controller.signal, timeout: config.timeout }, this.options.timeout ?? 15000)
    const cancel = () => controller.abort(config.signal?.reason ?? cancelled())
    if (config.signal?.aborted) cancel(); else config.signal?.addEventListener('abort', cancel, { once: true })
    try {
      const work = this.perform(config, mode, codec, endpoint, lifetime.signal)
      return await raceSignal(work, lifetime.signal)
    } catch (error) {
      const failure = lifetime.signal.aborted ? lifetime.signal.reason : error instanceof TypeError || error instanceof BusinessError || error instanceof CommunicationError ? error : normalizeError(error)
      // 观察器只执行一次；其错误不替换原错误，且仍受调用预算约束。
      const observer = config.onError ?? this.options.onError
      if (observer) {
        try { await raceSignal(Promise.resolve().then(() => observer(failure)), lifetime.signal) } catch { /* preserve failure */ }
      }
      throw failure
    } finally {
      lifetime.dispose(); config.signal?.removeEventListener('abort', cancel); this.lifetimes.delete(controller)
    }
  }
  private async perform(config: RequestConfig, mode: 'raw' | 'envelope' | 'data', codec: ResponseCodec, endpoint: Endpoint<EndpointSpec> | undefined, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    const session = this.options.session
    const initialVersion = session?.sessionVersion?.()
    if (initialVersion !== this.observedScope) { this.cache.clear(); this.observedScope = initialVersion }
    const generation = this.generation
    const assertCurrent = () => {
      signal.throwIfAborted()
      if (this.disposed || generation !== this.generation || (session?.sessionVersion && initialVersion !== session.sessionVersion())) throw cancelled()
    }
    const validators = endpoint?.options.inputValidators
    const body = await raceSignal(validate(validators?.body, config.body), signal)
    const query = await raceSignal(validate(validators?.query, config.query), signal)
    const params = await raceSignal(validate(validators?.params, config.params), signal)
    let prepared: RequestConfig = { ...config, body, query, params, headers: { ...config.headers } }
    if (this.options.beforeRequest) prepared = await raceSignal(Promise.resolve(this.options.beforeRequest(prepared)), signal)
    assertCurrent()
    const anonymous = prepared.anonymous ?? false
    let token = anonymous ? '' : prepared.sessionToken !== undefined ? prepared.sessionToken : session?.token ? session.token() : this.manualToken
    if (!anonymous && prepared.sessionToken === undefined && session?.ensureFreshToken) {
      token = await raceSignal(session.ensureFreshToken(), signal)
      assertCurrent()
      if (session.token && this.formatToken(token) !== this.formatToken(session.token())) throw cancelled()
    }
    if (!anonymous && session?.requireToken && !token) throw new CommunicationError('Authentication required', 'http', { status: 401 })
    const headers = mergeHeaders(this.options.headers, prepared.headers)
    headers.accept ??= (prepared.responseType ?? 'json') === 'json' ? 'application/json' : '*/*'
    const explicitAuth = prepared.headers && Object.keys(prepared.headers).some(key => key.toLowerCase() === 'authorization' || key.toLowerCase() === this.authHeader)
    if (anonymous || session) {
      delete headers.authorization; delete headers[this.authHeader]
      if (token) headers[this.authHeader] = this.formatToken(token)
    } else if (!headers[this.authHeader] && token) headers[this.authHeader] = this.formatToken(token)
    const selectedToken = this.formatToken(token)
    const assertSession = () => {
      assertCurrent()
      // provider 未给代次时仍阻止旧凭证响应；有代次时允许同身份续期。
      if (!anonymous && session?.token && !session.sessionVersion && prepared.sessionToken === undefined && selectedToken !== this.formatToken(session.token())) throw cancelled()
    }
    const method = prepared.method ?? 'GET'
    if ((method === 'GET' || method === 'HEAD') && prepared.body !== undefined) throw new TypeError(`${method} cannot have a body`)
    const url = requestURL(this.options.baseURL ?? '', prepared.url, prepared.params, prepared.query, prepared.querySerializer)
    const request = { url, method, headers, body: requestBody(prepared.body, headers), responseType: prepared.responseType ?? 'json', credentials: prepared.credentials ?? this.options.credentials } as const
    const load = async (transportSignal: AbortSignal): Promise<unknown> => {
      let response: TransportResponse
      try { response = await raceSignal(this.options.transport.send({ ...request, signal: transportSignal }), transportSignal) }
      catch (error) { throw normalizeError(error) }
      transportSignal.throwIfAborted()
      // 共享请求不能引用首个消费者的 signal；只检查共享状态与身份。
      if (this.disposed || generation !== this.generation || (session?.sessionVersion && initialVersion !== session.sessionVersion()) || (!anonymous && session?.token && !session.sessionVersion && selectedToken !== this.formatToken(session.token()))) throw cancelled()
      if (response.status < 200 || response.status >= 300) {
        if (response.status === 401 && session?.onUnauthorized && !anonymous && selectedToken && (!session.token || this.formatToken(session.token()) === selectedToken)) {
          try { await raceSignal(Promise.resolve(session.onUnauthorized()), transportSignal) } catch { /* preserve HTTP failure */ }
        }
        throw new HttpError(response)
      }
      if (mode === 'raw') return response
      const envelope = await raceSignal(parseEnvelope(codec, response.data), transportSignal)
      if (mode === 'envelope') return envelope
      let data: unknown
      try { data = await raceSignal(Promise.resolve(codec.unwrap(envelope)), transportSignal) }
      catch (error) {
        if (error instanceof BusinessError && error.status === undefined) Object.defineProperty(error, 'status', { value: response.status })
        if (error instanceof CommunicationError || transportSignal.aborted) throw error
        throw new InvalidResponseError('Response codec rejected data', error)
      }
      data = await raceSignal(validate(endpoint?.options.validator, data), transportSignal)
      transportSignal.throwIfAborted()
      if (this.disposed || generation !== this.generation || (session?.sessionVersion && initialVersion !== session.sessionVersion())) throw cancelled()
      return data
    }
    const policy = endpoint?.options.cache
    let result: unknown
    if (policy && !prepared.bypassCache && mode === 'data') {
      if (method !== 'GET') throw new TypeError('Only GET endpoints support caching')
      if ((session?.token || session?.ensureFreshToken) && !session.sessionVersion && !anonymous) throw new TypeError('Cached authenticated endpoints require sessionVersion')
      const settings: CachePolicy = policy === true ? {} : policy
      checkTTL(settings.ttl ?? this.options.cache?.ttl ?? 30000)
      checkTimeout(settings.transportTimeout ?? endpoint?.options.timeout ?? this.options.timeout ?? 15000)
      const safe = this.options.transport.cacheSafe !== false && !explicitAuth && !headers.cookie && prepared.sessionToken === undefined && (!headers[this.authHeader] || !!token)
      if (safe) {
        const publicHeaders = { ...headers }; delete publicHeaders.authorization; delete publicHeaders[this.authHeader]; delete publicHeaders.cookie
        const alias = settings.key?.({ body: prepared.body, query: prepared.query, params: prepared.params }) ?? url
        const key = `${endpoint!.identity}|${JSON.stringify([anonymous ? 'anonymous' : initialVersion ?? generation, alias, url, Object.entries(publicHeaders).sort(), request.credentials ?? 'same-origin', request.responseType, prepared.timeout ?? this.options.timeout ?? 15000, settings.transportTimeout ?? endpoint?.options.timeout ?? this.options.timeout ?? 15000])}`
        result = await this.cache.get(key, async sharedSignal => {
          const shared = requestLifetime({ signal: sharedSignal, timeout: settings.transportTimeout ?? endpoint?.options.timeout }, this.options.timeout ?? 15000)
          try { return await raceSignal(load(shared.signal), shared.signal) } finally { shared.dispose() }
        }, signal, { ttl: settings.ttl, tags: settings.tags, alias })
      } else result = await load(signal)
    } else result = await load(signal)
    assertSession()
    return result
  }
}
export function createClient(options: ClientOptions): Client { return new Client(options) }
