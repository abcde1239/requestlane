import type { RequestConfig } from "@/types/request";
import type { ResponseCodec } from "@/types/response";
import type { SessionOptions } from "@/types/session";
import type { Transport } from "@/types/transport";

export interface ClientOptions {
  transport: Transport;
  baseURL?: string;
  headers?: Readonly<Record<string, string>>;
  timeout?: number;
  credentials?: RequestCredentials;
  codec?: ResponseCodec;
  session?: SessionOptions;
  /** 默认 Bearer/Authorization；可用于 Basic、API key 或其他认证方案。 */
  auth?: { header?: string; format?: (token: string) => string };
  cache?: { capacity?: number; ttl?: number };
  beforeRequest?: (
    config: RequestConfig,
  ) => RequestConfig | Promise<RequestConfig>;
  onError?: (error: unknown) => void | Promise<void>;
}
