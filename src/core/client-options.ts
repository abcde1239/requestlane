import type { RequestConfig } from "@/types/request";
import type { ResponseCodec } from "@/types/response";
import type { SessionOptions } from "@/types/session";
import type { Transport } from "@/types/transport";
import type { CacheFactory, SessionFactory } from "@/core/capabilities";

export interface RequestClientOptions {
  transport: Transport;
  baseURL?: string;
  headers?: Readonly<Record<string, string>>;
  timeout?: number;
  credentials?: RequestCredentials;
  codec?: ResponseCodec;
  /** 默认 Bearer/Authorization；可用于 Basic、API key 或其他认证方案。 */
  auth?: { header?: string; format?: (token: string) => string };
  beforeRequest?: (
    config: RequestConfig,
  ) => RequestConfig | Promise<RequestConfig>;
  onError?: (error: unknown) => void | Promise<void>;
}

export interface CoreClientOptions extends RequestClientOptions {
  cache?: CacheFactory;
  session?: SessionFactory;
}

/** 完整门面保持原配置形式。 */
export interface ClientOptions extends RequestClientOptions {
  session?: SessionOptions;
  cache?: { capacity?: number; ttl?: number };
}
