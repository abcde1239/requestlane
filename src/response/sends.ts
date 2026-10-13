import type { ResponseCodec } from '@/types/response'
import type { StandardResponse, SuccessResponse } from '@/types/response'
import { BusinessError, InvalidResponseError } from '@/response/errors'
export type {
  StandardResponse,
  SuccessResponse,
  ErrorResponse,
} from '@/types/response'

export interface BusinessDefinition {
  message?: string
  status?: number
}
export function parseResponse<T = unknown>(
  value: unknown,
): StandardResponse<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InvalidResponseError()
  const envelope = value as Record<string, unknown>
  if (typeof envelope.msg !== 'string' || !envelope.msg.trim())
    throw new InvalidResponseError()
  if (
    envelope.code !== undefined &&
    (!Number.isSafeInteger(envelope.code) ||
      (envelope.code !== 0 && (envelope.code as number) < 1000))
  )
    throw new InvalidResponseError('Invalid business code')
  if (
    (envelope.code === 0 ||
      (envelope.code === undefined && envelope.msg === 'ok')) &&
    (!Object.hasOwn(envelope, 'data') || envelope.data === undefined)
  )
    throw new InvalidResponseError('Successful envelope requires data')
  return value as StandardResponse<T>
}
export function isSuccess<T>(
  response: StandardResponse<T>,
): response is SuccessResponse<T> {
  return response.code === undefined
    ? response.msg === 'ok'
    : response.code === 0
}
export function createSendsCodec(
  definitions: Readonly<Record<number, BusinessDefinition>> = {},
): ResponseCodec<StandardResponse<unknown>> {
  return {
    parse: parseResponse,
    unwrap(response) {
      if (!isSuccess(response)) {
        const definition =
          response.code === undefined ? undefined : definitions[response.code]
        throw new BusinessError(
          response,
          response.msg === 'ok'
            ? (definition?.message ?? 'Business request failed')
            : response.msg,
          { businessCode: response.code, suggestedStatus: definition?.status },
        )
      }
      return response.data
    },
  }
}
export const sendsCodec = createSendsCodec()
export function unwrapResponse<T = unknown>(value: unknown): T {
  return sendsCodec.unwrap(parseResponse(value)) as T
}
export type ErrorHandler = (error: unknown) => void | Promise<void>
async function observe(error: unknown, handler?: ErrorHandler): Promise<never> {
  try {
    await handler?.(error)
  } catch {
    /* preserve original */
  }
  throw error
}
export function wrapRequest<T>(
  request: Promise<StandardResponse<T>>,
  callback?: undefined,
  onError?: ErrorHandler,
): Promise<T>
export function wrapRequest<T, R>(
  request: Promise<StandardResponse<T>>,
  callback: (response: SuccessResponse<T>) => R | Promise<R>,
  onError?: ErrorHandler,
): Promise<R>
export async function wrapRequest<T, R>(
  request: Promise<StandardResponse<T>>,
  callback?: (response: SuccessResponse<T>) => R | Promise<R>,
  onError?: ErrorHandler,
): Promise<T | R> {
  try {
    const response = parseResponse<T>(await request)
    if (!isSuccess(response)) sendsCodec.unwrap(response)
    const success = response as SuccessResponse<T>
    return callback ? await callback(success) : success.data
  } catch (error) {
    return observe(error, onError)
  }
}
export function getData<T>(
  request: Promise<StandardResponse<T>>,
  onError?: ErrorHandler,
): Promise<T> {
  return wrapRequest(request, undefined, onError)
}
export async function checkOk<T>(
  request: Promise<StandardResponse<T>>,
  onError?: ErrorHandler,
): Promise<boolean> {
  await getData(request, onError)
  return true
}
