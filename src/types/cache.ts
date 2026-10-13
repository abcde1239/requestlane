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
