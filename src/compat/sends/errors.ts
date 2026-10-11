import { classifyError as classify, normalizeError, type ErrorInfo, type ErrorKind } from '../../response/errors.js'
export type { ErrorKind } from '../../response/errors.js'
export function responseErrorInfo(value: unknown, status?: number): { status?: number; code?: number; message: string; kind: ErrorKind } {
  const envelope = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { status, code: typeof envelope.code === 'number' ? envelope.code : undefined, message: typeof envelope.msg === 'string' && envelope.msg !== 'ok' ? envelope.msg : `Request failed${status ? ` (${status})` : ''}`, kind: typeof envelope.code === 'number' && envelope.code !== 0 ? 'business' : 'http' }
}
export function legacyFailure(error: unknown) { return classify(normalizeError(error)) }
export function classifyError(error: unknown): ErrorInfo {
  if (error instanceof Error && 'kind' in error && 'status' in error) {
    const service = error as Error & { kind: ErrorKind; status: number; businessCode?: number }
    return { kind: service.kind, status: service.status, businessCode: service.businessCode, message: service.message, retryable: service.kind === 'network' || service.kind === 'timeout' || service.status === 429 || service.status >= 500 }
  }
  return classify(error)
}
export function errorMessage(error: unknown): string { const info = classifyError(error); return info.kind === 'cancelled' ? '' : info.message }
