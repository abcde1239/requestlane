import axios, {
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { Transport } from '@'
import { createFetchTransport, type Fetcher } from '@/adapters/fetch'
import { createAxiosTransport } from '@/adapters/axios'
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
export async function flush(): Promise<void> {
  for (let i = 0; i < 25; i++) await Promise.resolve()
}
export interface RecordedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
  signal?: AbortSignal
}
export function fixture(kind: 'axios' | 'fetch') {
  const requests: RecordedRequest[] = []
  let status = 200
  let payload: string | Uint8Array = JSON.stringify({ value: 1 })
  let failure: unknown
  let gate: ReturnType<typeof deferred<void>> | undefined
  function record(request: RecordedRequest) {
    requests.push(request)
  }
  const fetcher: Fetcher = async (input, init) => {
    record({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers)),
      body: init?.body,
      signal: init?.signal ?? undefined,
    })
    if (gate) await gate.promise
    if (failure) throw failure
    return new Response(
      status === 204 || init?.method === 'HEAD'
        ? null
        : typeof payload === 'string'
          ? payload
          : new Uint8Array(payload).buffer,
      {
        status,
        headers: { 'X-Trace': 'trace', 'Content-Type': 'application/json' },
      },
    )
  }
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    record({
      url: config.url!,
      method: config.method!.toUpperCase(),
      headers: config.headers.toJSON() as Record<string, string>,
      body: config.data,
      signal: config.signal as AbortSignal,
    })
    if (gate) await gate.promise
    if (failure) throw failure
    return {
      status,
      statusText: 'Test',
      headers: new AxiosHeaders({
        'X-Trace': 'trace',
        'Content-Type': 'application/json',
      }),
      data: payload,
      config,
    }
  }
  const transport: Transport =
    kind === 'fetch'
      ? createFetchTransport({ fetcher })
      : createAxiosTransport({
          instance: axios.create({ adapter }),
          cacheSafe: true,
        })
  return {
    transport,
    requests,
    adapter,
    fetcher,
    respond(data: unknown, nextStatus = 200) {
      status = nextStatus
      payload = JSON.stringify(data)
      failure = undefined
    },
    text(data: string, nextStatus = 200) {
      status = nextStatus
      payload = data
      failure = undefined
    },
    bytes(data: Uint8Array) {
      payload = data
    },
    fail(error: unknown) {
      failure = error
    },
    hold() {
      gate = deferred<void>()
      return gate
    },
  }
}
