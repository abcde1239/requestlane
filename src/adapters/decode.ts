import type { ResponseType, TransportResponse } from '../core/types.js'
import { InvalidResponseError } from '../response/errors.js'
export function decodeText(text: string, type: ResponseType, status: number, method: string): unknown {
  if (method === 'HEAD' || status === 204) return undefined
  if (type === 'text') return text
  if (status < 200 || status >= 300) {
    try { return text ? JSON.parse(text) : undefined } catch { return text }
  }
  try { return JSON.parse(text) } catch (error) { throw new InvalidResponseError('Invalid JSON response', error) }
}
export function normalizeResponse<T>(response: TransportResponse<T>): TransportResponse<T> {
  return { ...response, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), String(value)])) }
}
