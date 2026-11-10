import type { RequestClientOptions } from "@/core/client-options";
import type { CacheStore } from "@/types/cache";
import type { Scope } from "@/types/common";
import type { RequestConfig } from "@/types/request";
import type { Endpoint, EndpointSpec } from "@/types/endpoint";
import type { PreparedRequest } from "@/core/prepare-request";
import type { ResponseMode } from "@/core/request-executor";

/** 每个客户端单独创建能力实例，避免跨实例共享身份或缓存状态。 */
export interface CapabilityHost {
  readonly options: RequestClientOptions;
  readonly generation: number;
  readonly disposed: boolean;
  identityChanged(): void;
}
export interface SessionSnapshot {
  readonly version: Scope | undefined;
  assertCurrent(): void;
}
export interface SessionContext {
  readonly token: string;
  readonly selectedToken: string;
  readonly initialVersion: Scope | undefined;
  readonly requiresCacheScope: boolean;
  assertResponse(): void;
  assertConsumer(): void;
  unauthorized(signal: AbortSignal): Promise<void>;
}
export interface SessionBinding {
  setToken(token: string): void;
  begin(): SessionSnapshot;
  authorize(
    config: RequestConfig,
    headers: Record<string, string>,
    snapshot: SessionSnapshot,
    signal: AbortSignal,
  ): Promise<SessionContext>;
}
export type SessionFactory = (host: CapabilityHost) => SessionBinding;
export interface CacheBinding {
  readonly store: CacheStore;
  read(
    context: PreparedRequest,
    mode: ResponseMode,
    endpoint: Endpoint<EndpointSpec> | undefined,
    signal: AbortSignal,
    load: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<unknown>;
}
export type CacheFactory = (host: CapabilityHost) => CacheBinding;
