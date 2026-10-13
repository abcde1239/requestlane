import type { ClientOptions } from '@/core/client-options'
import { ClientState } from '@/core/client-state'
import { RequestExecutor } from '@/core/request-executor'
import type { ReadCache } from '@/cache/index'
import { identityCodec } from '@/response/codec'
import type { ReadonlyData } from '@/types/common'
import type {
  EndpointSpec,
  Endpoint,
  EndpointInput,
  EndpointData,
} from '@/types/endpoint'
import type { RequestConfig, RequestOptions } from '@/types/request'
import type { TransportResponse } from '@/types/transport'

export type { ClientOptions } from '@/core/client-options'

/** 提供强类型调用接口，内部执行细节交给 RequestExecutor。 */
export class Client {
  readonly cache: ReadCache
  private readonly options: ClientOptions
  private readonly executor: RequestExecutor

  constructor(options: ClientOptions) {
    const state = new ClientState(options)
    this.options = state.options
    this.cache = state.cache
    this.executor = new RequestExecutor(state)
  }

  setToken(token: string): void {
    this.executor.state.setToken(token)
  }
  clearToken(): void {
    this.setToken('')
  }
  invalidate(
    filter: {
      key?: string
      tag?: string
      endpoint?: { readonly identity: number }
    } = {},
  ): void {
    this.cache.invalidate({
      key: filter.key,
      tag: filter.tag,
      prefix: filter.endpoint ? `${filter.endpoint.identity}|` : undefined,
    })
  }
  dispose(): void {
    this.executor.state.dispose()
  }
  async withInvalidation<T>(
    tags: readonly string[],
    write: () => Promise<T>,
  ): Promise<T> {
    const clear = () => {
      for (const tag of tags) this.invalidate({ tag })
    }
    clear()
    try {
      return await write()
    } finally {
      clear()
    }
  }
  requestRaw<Data = unknown, Body = unknown, Query = unknown, Params = unknown>(
    config: RequestConfig<Body, Query, Params>,
  ): Promise<TransportResponse<Data>> {
    return this.executor.execute(config as RequestConfig, 'raw') as Promise<
      TransportResponse<Data>
    >
  }
  requestEnvelope<
    Envelope = unknown,
    Body = unknown,
    Query = unknown,
    Params = unknown,
  >(
    config: RequestConfig<Body, Query, Params>,
    codec = this.options.codec ?? identityCodec,
  ): Promise<Envelope> {
    return this.executor.execute(
      config as RequestConfig,
      'envelope',
      codec,
    ) as Promise<Envelope>
  }
  requestData<
    Data = unknown,
    Body = unknown,
    Query = unknown,
    Params = unknown,
  >(
    config: RequestConfig<Body, Query, Params>,
    codec = this.options.codec ?? identityCodec,
  ): Promise<Data> {
    return this.executor.execute(
      config as RequestConfig,
      'data',
      codec,
    ) as Promise<Data>
  }
  get<Data = unknown, Query = unknown>(
    url: string,
    config: Omit<RequestConfig<never, Query>, 'url' | 'method' | 'body'> = {},
  ): Promise<Data> {
    return this.requestData({ ...config, url, method: 'GET' })
  }
  post<Data = unknown, Body = unknown, Query = unknown>(
    url: string,
    body?: Body,
    config: Omit<RequestConfig<Body, Query>, 'url' | 'method' | 'body'> = {},
  ): Promise<Data> {
    return this.requestData({ ...config, url, method: 'POST', body })
  }
  put<Data = unknown, Body = unknown, Query = unknown>(
    url: string,
    body?: Body,
    config: Omit<RequestConfig<Body, Query>, 'url' | 'method' | 'body'> = {},
  ): Promise<Data> {
    return this.requestData({ ...config, url, method: 'PUT', body })
  }
  patch<Data = unknown, Body = unknown, Query = unknown>(
    url: string,
    body?: Body,
    config: Omit<RequestConfig<Body, Query>, 'url' | 'method' | 'body'> = {},
  ): Promise<Data> {
    return this.requestData({ ...config, url, method: 'PATCH', body })
  }
  delete<Data = unknown, Query = unknown>(
    url: string,
    config: Omit<RequestConfig<never, Query>, 'url' | 'method' | 'body'> = {},
  ): Promise<Data> {
    return this.requestData({ ...config, url, method: 'DELETE' })
  }
  head(url: string, config: RequestOptions = {}): Promise<TransportResponse> {
    return this.requestRaw({ ...config, url, method: 'HEAD' })
  }
  call<S extends EndpointSpec>(
    endpoint: Endpoint<S>,
    input: EndpointInput<S>,
    options: RequestOptions = {},
  ): Promise<ReadonlyData<EndpointData<S>>> {
    const spec = endpoint.options
    const config: RequestConfig = {
      url: spec.path,
      method: spec.method,
      timeout: spec.timeout,
      anonymous: spec.anonymous,
      responseType: spec.responseType,
      ...input,
      ...options,
      querySerializer: spec.querySerializer as
        ((query: unknown) => string) | undefined,
    }
    // endpoint 的精确类型只在公开边界使用，内部统一为 unknown。
    return this.executor.execute(
      config,
      'data',
      spec.codec ?? this.options.codec ?? identityCodec,
      endpoint as unknown as Endpoint<EndpointSpec>,
    ) as Promise<ReadonlyData<EndpointData<S>>>
  }
}
export function createClient(options: ClientOptions): Client {
  return new Client(options)
}
