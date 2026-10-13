import type { Transport, TransportRequest } from '@/types/transport'
import { decodeText, normalizeResponse } from '@/adapters/decode'
export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>
export interface FetchTransportOptions {
  fetcher?: Fetcher
}
export function createFetchTransport(
  options: FetchTransportOptions = {},
): Transport & { native: Fetcher } {
  const fetcher = options.fetcher ?? globalThis.fetch
  if (!fetcher) throw new TypeError('A fetch implementation is required')
  return {
    cacheSafe: true,
    native: (input, init) => fetcher(input, init),
    async send(request: TransportRequest) {
      const response = await fetcher(request.url, {
        method: request.method,
        headers: { ...request.headers },
        body: request.body,
        signal: request.signal,
        credentials: request.credentials ?? 'same-origin',
        cache: 'no-store',
      })
      let data: unknown
      if (request.method === 'HEAD' || response.status === 204) data = undefined
      else if (request.responseType === 'blob') data = await response.blob()
      else if (request.responseType === 'arraybuffer')
        data = await response.arrayBuffer()
      else
        data = decodeText(
          await response.text(),
          request.responseType,
          response.status,
          request.method,
        )
      request.signal.throwIfAborted()
      return normalizeResponse({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        url: response.url || request.url,
        data,
      })
    },
  }
}
