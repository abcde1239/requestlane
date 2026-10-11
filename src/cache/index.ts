import { cancelled } from '../response/errors.js'
import { raceSignal } from '../request/lifecycle.js'
interface Entry {
  key: string
  alias: string
  tags: readonly string[]
  controller: AbortController
  promise: Promise<unknown>
  consumers: number
  settled: boolean
  expires: number
}
export interface CacheReadOptions { ttl?: number; tags?: readonly string[]; alias?: string }
export function checkTTL(ttl: number): void {
  if (!Number.isFinite(ttl) || ttl < 0) throw new TypeError('ttl must be a finite non-negative number')
}
/** 实例内 FIFO 读取缓存；active 不随容量淘汰，失效仍能取消所有在途项。 */
export class ReadCache {
  private entries = new Map<string, Entry>()
  private active = new Set<Entry>()
  constructor(private readonly ttl = 30000, private readonly capacity = 20) {
    checkTTL(ttl)
    if (!Number.isInteger(capacity) || capacity < 1) throw new TypeError('capacity must be a positive integer')
  }
  get size(): number { return this.entries.size }
  get pending(): number { return this.active.size }
  clear(): void { this.invalidate() }
  invalidate(filter: { key?: string; tag?: string; prefix?: string } = {}): void {
    for (const entry of new Set([...this.entries.values(), ...this.active])) {
      if (filter.key !== undefined && entry.key !== filter.key && entry.alias !== filter.key) continue
      if (filter.tag !== undefined && !entry.tags.includes(filter.tag)) continue
      if (filter.prefix !== undefined && !entry.key.startsWith(filter.prefix)) continue
      if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key)
      this.active.delete(entry)
      entry.controller.abort(cancelled())
    }
  }
  get<T>(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, options: CacheReadOptions = {}): Promise<T> {
    const ttl = options.ttl ?? this.ttl
    checkTTL(ttl)
    if (signal?.aborted) return Promise.reject(signal.reason ?? cancelled())
    let entry = this.entries.get(key)
    if (entry?.settled && entry.expires <= Date.now()) { this.entries.delete(key); entry = undefined }
    if (!entry) {
      while (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!)
      const controller = new AbortController()
      const created: Entry = { key, alias: options.alias ?? key, tags: [...(options.tags ?? [])], controller, consumers: 0, settled: false, expires: 0, promise: Promise.resolve() }
      created.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return raceSignal(Promise.resolve(load(controller.signal)), controller.signal)
      }).then(data => {
        controller.signal.throwIfAborted()
        created.settled = true
        created.expires = Date.now() + ttl
        return data
      }).catch(error => {
        if (this.entries.get(key) === created) this.entries.delete(key)
        throw error
      }).finally(() => this.active.delete(created))
      this.active.add(created)
      this.entries.set(key, created)
      entry = created
    }
    const current = entry
    current.consumers++
    return new Promise<T>((resolve, reject) => {
      let finished = false
      const finish = () => {
        if (finished) return false
        finished = true
        signal?.removeEventListener('abort', cancelConsumer)
        current.controller.signal.removeEventListener('abort', cancelShared)
        current.consumers--
        return true
      }
      const cancelConsumer = () => {
        if (!finish()) return
        reject(signal?.reason ?? cancelled())
        if (!current.settled && current.consumers === 0) {
          if (this.entries.get(key) === current) this.entries.delete(key)
          current.controller.abort(cancelled())
        }
      }
      const cancelShared = () => { if (finish()) reject(current.controller.signal.reason ?? cancelled()) }
      signal?.addEventListener('abort', cancelConsumer, { once: true })
      current.controller.signal.addEventListener('abort', cancelShared, { once: true })
      current.promise.then(data => { if (finish()) resolve(data as T) }, error => { if (finish()) reject(error) })
      // 注册与检查均在同一同步段，处理已经失效的缓存引用。
      if (current.controller.signal.aborted) cancelShared()
    })
  }
}
