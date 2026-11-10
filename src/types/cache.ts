export interface CachePolicy {
  ttl?: number;
  tags?: readonly string[];
  key?: (input: unknown) => string;
  transportTimeout?: number;
}
export interface Entry {
  key: string;
  alias: string;
  tags: readonly string[];
  controller: AbortController;
  promise: Promise<unknown>;
  consumers: number;
  settled: boolean;
  expires: number;
}

export interface CacheReadOptions {
  ttl?: number;
  tags?: readonly string[];
  alias?: string;
}

export interface CacheInvalidationFilter {
  key?: string;
  tag?: string;
  prefix?: string;
}

/** 请求集成依赖的结构化缓存接口，不引用具体内存实现。 */
export interface CacheStore {
  readonly size: number;
  readonly pending: number;
  clear(): void;
  invalidate(filter?: CacheInvalidationFilter): void;
  get<T>(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    options?: CacheReadOptions,
  ): Promise<T>;
}
