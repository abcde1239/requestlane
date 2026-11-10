import type { CapabilityHost, CacheFactory } from "@/core/capabilities";
import { ReadCache } from "@/cache/read-cache";
import type { PreparedRequest } from "@/core/prepare-request";
import type { ResponseMode } from "@/core/request-executor";
import { checkTTL } from "@/utils/checkTTL";
import { checkTimeout, raceSignal, requestLifetime } from "@/request/lifecycle";
import type { CachePolicy } from "@/types/cache";
import type { Endpoint, EndpointSpec } from "@/types/endpoint";

/** 缓存准入、身份隔离的 key 与共享传输预算。 */
async function readRequest(
  state: CapabilityHost,
  store: ReadCache,
  options: MemoryCacheOptions,
  context: PreparedRequest,
  mode: ResponseMode,
  endpoint: Endpoint<EndpointSpec> | undefined,
  signal: AbortSignal,
  load: (signal: AbortSignal) => Promise<unknown>,
): Promise<unknown> {
  const {
    prepared,
    request,
    anonymous,
    identity,
    authHeader,
    explicitAuth,
    generation,
  } = context;
  const { method, url, headers } = request;
  const policy = endpoint?.options.cache;
  let result: unknown;
  if (policy && !prepared.bypassCache && mode === "data") {
    if (method !== "GET")
      throw new TypeError("Only GET endpoints support caching");
    if (identity?.requiresCacheScope)
      throw new TypeError(
        "Cached authenticated endpoints require sessionVersion",
      );
    const settings: CachePolicy = policy === true ? {} : policy;
    checkTTL(settings.ttl ?? options.ttl ?? 30000);
    checkTimeout(
      settings.transportTimeout ??
        endpoint?.options.timeout ??
        state.options.timeout ??
        15000,
    );
    const safe =
      state.options.transport.cacheSafe !== false &&
      !explicitAuth &&
      !headers.cookie &&
      prepared.sessionToken === undefined &&
      (!headers.authorization ||
        (authHeader === "authorization" && !!identity?.token)) &&
      (!headers[authHeader] || !!identity?.token);
    if (safe) {
      const publicHeaders = { ...headers };
      delete publicHeaders.authorization;
      delete publicHeaders[authHeader];
      delete publicHeaders.cookie;
      const alias =
        settings.key?.({
          body: prepared.body,
          query: prepared.query,
          params: prepared.params,
        }) ?? url;
      const key = `${endpoint!.identity}|${JSON.stringify([
        anonymous ? "anonymous" : (identity?.initialVersion ?? generation),
        alias,
        url,
        Object.entries(publicHeaders).sort(),
        request.credentials ?? "same-origin",
        request.responseType,
        prepared.timeout ?? state.options.timeout ?? 15000,
        settings.transportTimeout ??
          endpoint?.options.timeout ??
          state.options.timeout ??
          15000,
      ])}`;
      result = await store.get(
        key,
        async (sharedSignal) => {
          const shared = requestLifetime(
            {
              signal: sharedSignal,
              timeout: settings.transportTimeout ?? endpoint?.options.timeout,
            },
            state.options.timeout ?? 15000,
          );
          try {
            return await raceSignal(load(shared.signal), shared.signal);
          } finally {
            shared.dispose();
          }
        },
        signal,
        { ttl: settings.ttl, tags: settings.tags, alias },
      );
    } else result = await load(signal);
  } else result = await load(signal);
  return result;
}

export interface MemoryCacheOptions {
  capacity?: number;
  ttl?: number;
}
/** 请求缓存集成；每次组合创建独立存储，不共享客户端身份。 */
export function createMemoryCache(
  options: MemoryCacheOptions = {},
): CacheFactory {
  const settings = { ...options };
  return (host) => {
    const store = new ReadCache(settings.ttl ?? 30000, settings.capacity ?? 20);
    return {
      store,
      read: (context, mode, endpoint, signal, load) =>
        readRequest(
          host,
          store,
          settings,
          context,
          mode,
          endpoint,
          signal,
          load,
        ),
    };
  };
}
