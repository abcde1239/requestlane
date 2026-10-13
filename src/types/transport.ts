import type { Method, ResponseType } from '@/types/common'

/**
 * 描述一次 HTTP 请求在传输层所需的配置。
 *
 * 该接口作为请求封装层与底层传输适配器之间的数据契约，
 * 统一定义请求地址、请求方法、请求头、请求体、取消信号
 * 以及响应解析等信息。
 *
 * @example
 * const request: TransportRequest = {
 *   url: '/api/users',
 *   method: 'GET',
 *   headers: {
 *     Accept: 'application/json',
 *   },
 *   signal: controller.signal,
 *   responseType: 'json',
 *   credentials: 'include',
 * };
 */
export interface TransportRequest {
  url: string
  method: Method
  headers: Readonly<Record<string, string>>
  body?: BodyInit
  signal: AbortSignal
  responseType: ResponseType
  credentials?: RequestCredentials
}
/**
 * 描述一次 HTTP 响应在传输层的标准化结构。
 *
 * 作为底层传输适配器向上层返回响应数据的统一数据契约，
 * 包含 HTTP 状态信息、响应头、最终响应地址以及响应体数据。
 * @typeParam T - 响应体数据的类型，默认为 `unknown`。
 *
 * @example
 * const response: TransportResponse<{ id: number; name: string }> = {
 *   status: 200,
 *   statusText: 'OK',
 *   headers: {
 *     'content-type': 'application/json',
 *   },
 *   url: '/api/users/1',
 *   data: {
 *     id: 1,
 *     name: 'Alice',
 *   },
 * };
 */
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
