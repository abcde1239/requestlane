export function mergeHeaders(...groups: (Readonly<Record<string, string>> | undefined)[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const group of groups) if (group) for (const [key, value] of Object.entries(group)) result[key.toLowerCase()] = value
  return result
}
export function queryString(query: unknown): string {
  if (query === undefined) return ''
  if (query === null || typeof query !== 'object' || Array.isArray(query)) throw new TypeError('query must be an object')
  if (Object.getPrototypeOf(query) !== Object.prototype && Object.getPrototypeOf(query) !== null) throw new TypeError('Non-plain query values require querySerializer')
  const result = new URLSearchParams()
  for (const key of Object.keys(query).sort()) {
    const value = (query as Record<string, unknown>)[key]
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined) continue
      if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) throw new TypeError('Nested query values require querySerializer')
      result.append(key, item === null ? '' : String(item))
    }
  }
  return result.toString()
}
export function requestURL(baseURL: string, path: string, params: unknown, query: unknown, serializer?: (query: unknown) => string): string {
  const values = (params ?? {}) as Record<string, unknown>
  const expanded = path.replace(/:([a-zA-Z_][\w]*)/g, (placeholder, name: string, offset: number) => {
    // 不把 https:// 的 scheme 当成参数。
    if (offset > 0 && path[offset - 1] !== '/') return placeholder
    if (values[name] === undefined || values[name] === null) throw new TypeError(`Missing path parameter: ${name}`)
    return encodeURIComponent(String(values[name]))
  })
  const url = /^[a-z][a-z\d+.-]*:\/\//i.test(expanded) ? expanded : expanded ? `${baseURL.replace(/\/$/, '')}/${expanded.replace(/^\//, '')}` : baseURL
  const queryPart = serializer && query !== undefined ? serializer(query) : queryString(query)
  const [beforeHash = '', ...hash] = url.split('#')
  return beforeHash + (queryPart ? `${beforeHash.includes('?') ? '&' : '?'}${queryPart.replace(/^\?/, '')}` : '') + (hash.length ? `#${hash.join('#')}` : '')
}
export function requestBody(value: unknown, headers: Record<string, string>): BodyInit | undefined {
  if (value === undefined) return undefined
  if (value instanceof FormData) return value
  if (value instanceof URLSearchParams) { headers['content-type'] ??= 'application/x-www-form-urlencoded;charset=UTF-8'; return value.toString() }
  if (typeof value === 'string') { headers['content-type'] ??= 'text/plain;charset=UTF-8'; return value }
  if (value instanceof Blob) { headers['content-type'] ??= value.type || 'application/octet-stream'; return value }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    headers['content-type'] ??= 'application/octet-stream'
    return value instanceof ArrayBuffer ? value : new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer
  }
  if (value instanceof ReadableStream) throw new TypeError('Streaming bodies require a native transport entry')
  headers['content-type'] ??= 'application/json'
  return JSON.stringify(value)
}
