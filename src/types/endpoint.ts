import type { CachePolicy } from '@/types/cache'
import type { Method, ResponseType } from '@/types/common'
import type { ResponseCodec, Validator } from '@/types/response'

export interface EndpointSpec {
  body?: unknown
  query?: unknown
  params?: unknown
  data?: unknown
}
type Field<S, K extends PropertyKey> = K extends keyof S ? S[K] : unknown
export type EndpointInput<S extends EndpointSpec> = ('body' extends keyof S
  ? { body: S['body'] }
  : { body?: never }) &
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
