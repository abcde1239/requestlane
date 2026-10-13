import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type CreateAxiosDefaults,
} from 'axios'
import type { Transport, TransportRequest } from '@/types/transport'
import { decodeText, normalizeResponse } from '@/adapters/decode'
import { CommunicationError } from '@/response/errors'
export interface AxiosTransportOptions {
  instance?: AxiosInstance
  config?: CreateAxiosDefaults
  /** 注入实例/配置的动态拦截器与默认值稳定时由宿主明确声明。 */
  cacheSafe?: boolean
}
export function createAxiosTransport(
  options: AxiosTransportOptions = {},
): Transport & { native: AxiosInstance } {
  const instance = options.instance ?? axios.create(options.config)
  return {
    cacheSafe: options.cacheSafe ?? (!options.instance && !options.config),
    native: instance,
    async send(request: TransportRequest) {
      if (request.credentials === 'omit')
        throw new CommunicationError(
          'Axios cannot guarantee omission of same-origin cookies; use Fetch',
          'validation',
        )
      const binary =
        request.responseType === 'blob' ||
        request.responseType === 'arraybuffer'
      const response = await instance.request<unknown>({
        url: request.url,
        baseURL: '',
        params: null,
        method: request.method,
        headers: {
          ...request.headers,
          authorization: request.headers.authorization ?? null,
          cookie: request.headers.cookie ?? null,
        },
        data: request.body,
        signal: request.signal,
        timeout: 0,
        withCredentials: request.credentials === 'include',
        responseType: binary ? 'arraybuffer' : 'text',
        validateStatus: () => true,
        transformRequest: [(value) => value],
        transformResponse: [(value) => value],
      })
      request.signal.throwIfAborted()
      let data: unknown
      if (request.method === 'HEAD' || response.status === 204) data = undefined
      else if (binary) {
        const value = response.data
        const buffer =
          value instanceof ArrayBuffer
            ? value
            : ArrayBuffer.isView(value)
              ? (value.buffer.slice(
                  value.byteOffset,
                  value.byteOffset + value.byteLength,
                ) as ArrayBuffer)
              : new TextEncoder().encode(String(value)).buffer
        data =
          request.responseType === 'blob'
            ? new Blob([buffer], {
                type: String(response.headers['content-type'] ?? ''),
              })
            : buffer
      } else
        data = decodeText(
          typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data),
          request.responseType,
          response.status,
          request.method,
        )
      return normalizeResponse({
        status: response.status,
        statusText: response.statusText,
        headers: AxiosHeaders.from(
          response.headers as AxiosHeaders,
        ).toJSON() as Record<string, string>,
        url: request.url,
        data,
      })
    },
  }
}
