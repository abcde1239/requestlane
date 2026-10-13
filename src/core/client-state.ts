import type { ClientOptions } from '@/core/client-options'
import { ReadCache } from '@/cache/index'
import { mergeHeaders } from '@/utils/serialization'
import { bearerToken, checkTimeout } from '@/request/lifecycle'
import { cancelled } from '@/response/errors'

/** 实例状态仅由执行管线使用；不作为包的公开接口导出。 */
export class ClientState {
  readonly cache: ReadCache
  readonly options: ClientOptions
  manualToken = ''
  generation = 0
  disposed = false
  lifetimes = new Set<AbortController>()
  observedScope: string | number | undefined

  constructor(options: ClientOptions) {
    checkTimeout(options.timeout ?? 15000)
    this.options = {
      ...options,
      headers: { ...options.headers },
      session: options.session ? { ...options.session } : undefined,
    }
    this.cache = new ReadCache(
      options.cache?.ttl ?? 30000,
      options.cache?.capacity ?? 20,
    )
    this.observedScope = options.session?.sessionVersion?.()
  }

  setToken(token: string): void {
    const old = this.formatToken(this.manualToken)
    const normalized = this.formatToken(token)
    this.manualToken = token
    if (!this.options.session?.token) {
      const headers = mergeHeaders(this.options.headers)
      const hadDefault =
        headers[this.authHeader] !== undefined ||
        headers.authorization !== undefined
      delete headers[this.authHeader]
      delete headers.authorization
      this.options.headers = headers
      if (normalized !== old || hadDefault) {
        this.generation++
        this.cache.clear()
      }
    }
  }

  get authHeader(): string {
    return (this.options.auth?.header ?? 'authorization').toLowerCase()
  }

  formatToken(token: string): string {
    return token.trim() ? (this.options.auth?.format ?? bearerToken)(token) : ''
  }

  dispose(): void {
    this.disposed = true
    this.generation++
    this.cache.clear()
    for (const controller of this.lifetimes) controller.abort(cancelled())
    this.lifetimes.clear()
  }
}
