export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type ResponseType = 'json' | 'text' | 'blob' | 'arraybuffer'
export type Scope = string | number
export type ReadonlyData<T> = T extends (...args: never[]) => unknown ? T : T extends readonly unknown[]
  ? { readonly [K in keyof T]: ReadonlyData<T[K]> }
  : T extends Record<string, unknown> ? { readonly [K in keyof T]: ReadonlyData<T[K]> }
  : T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T

export interface TransportRequest {
  url: string
  method: Method
  headers: Readonly<Record<string, string>>
  body?: BodyInit
  signal: AbortSignal
  responseType: ResponseType
  credentials?: RequestCredentials
}
export interface TransportResponse<T = unknown> {
  status: number
  statusText: string
  headers: Readonly<Record<string, string>>
  url: string
  data: T
}
export interface Transport {
  /** 原生拦截器等无法观察的变化存在时，适配器应关闭自动缓存。 */
  readonly cacheSafe?: boolean
  send(request: TransportRequest): Promise<TransportResponse>
}
export interface Validator<T> { parse(value: unknown): T | Promise<T> }
export interface ResponseCodec<Envelope = unknown> {
  parse(value: unknown): Envelope | Promise<Envelope>
  unwrap(envelope: Envelope): unknown | Promise<unknown>
}
export interface RequestOptions {
  signal?: AbortSignal
  timeout?: number
  anonymous?: boolean
  sessionToken?: string
  bypassCache?: boolean
  headers?: Readonly<Record<string, string>>
  credentials?: RequestCredentials
  responseType?: ResponseType
  onError?: (error: unknown) => void | Promise<void>
}
export interface RequestConfig<Body = unknown, Query = unknown, Params = unknown> extends RequestOptions {
  url: string
  method?: Method
  body?: Body
  query?: Query
  params?: Params
  querySerializer?: (query: Query) => string
}
export interface SessionOptions {
  token?: () => string
  ensureFreshToken?: () => Promise<string>
  sessionVersion?: () => Scope
  onUnauthorized?: () => void | Promise<void>
  requireToken?: boolean
}
export interface CachePolicy {
  ttl?: number
  tags?: readonly string[]
  key?: (input: unknown) => string
  /** 共享底层传输的预算；独立于每个消费者的 timeout。 */
  transportTimeout?: number
}
export interface EndpointSpec { body?: unknown; query?: unknown; params?: unknown; data?: unknown }
type Field<S, K extends PropertyKey> = K extends keyof S ? S[K] : unknown
export type EndpointInput<S extends EndpointSpec> =
  ('body' extends keyof S ? { body: S['body'] } : { body?: never }) &
  ('query' extends keyof S ? { query: S['query'] } : { query?: never }) &
  ('params' extends keyof S ? { params: S['params'] } : { params?: never })
export type EndpointData<S extends EndpointSpec> = Field<S, 'data'>
export interface EndpointOptions<S extends EndpointSpec> {
  id?: string
  method: 'body' extends keyof S ? Exclude<Method, 'GET' | 'HEAD'> : Method
  path: string
  codec?: ResponseCodec
  validator?: Validator<EndpointData<S>>
  inputValidators?: {
    body?: Validator<Field<S, 'body'>>
    query?: Validator<Field<S, 'query'>>
    params?: Validator<Field<S, 'params'>>
  }
  querySerializer?: (query: Field<S, 'query'>) => string
  cache?: boolean | CachePolicy
  timeout?: number
  anonymous?: boolean
  responseType?: ResponseType
}
export interface Endpoint<S extends EndpointSpec> {
  readonly options: Readonly<EndpointOptions<S>>
  readonly identity: number
  /** 仅供类型推断；函数标记使端点输入输出保持关联。 */
  readonly _types?: (input: S) => S
}
