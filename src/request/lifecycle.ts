import { CommunicationError, cancelled } from '../response/errors.js'
export function checkTimeout(timeout: number): void {
  if (!Number.isFinite(timeout) || timeout < 0) throw new TypeError('timeout must be a finite non-negative number')
}
export function requestLifetime(options: { signal?: AbortSignal; timeout?: number } = {}, defaultTimeout = 15000) {
  const timeout = options.timeout ?? defaultTimeout
  checkTimeout(timeout)
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort(cancelled(options.signal?.reason))
  if (options.signal?.aborted) abort()
  else options.signal?.addEventListener('abort', abort, { once: true })
  const timer = timeout > 0 ? setTimeout(() => {
    timedOut = true
    controller.abort(new CommunicationError('Request timed out', 'timeout'))
  }, timeout) : undefined
  return {
    signal: controller.signal,
    get timedOut() { return timedOut },
    dispose() { if (timer !== undefined) clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
  }
}
/** race 不仅发 abort 信号，也让忽略信号的校验器/transport 的消费者及时结束。 */
export function raceSignal<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason ?? cancelled()) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    // 无论是否已经取消，都观察 pending，避免迟到拒绝成为 unhandled rejection。
    pending.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}
export function bearerToken(token: string): string {
  const raw = token.trim().replace(/^Bearer\s+/i, '').trim()
  return raw ? `Bearer ${raw}` : ''
}
export function isRequestCancelled(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || (error instanceof CommunicationError && error.kind === 'cancelled') || ('code' in error && error.code === 'ERR_CANCELED'))
}
