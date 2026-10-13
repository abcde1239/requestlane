import type { ClientState } from "@/core/client-state";
import type { PreparedRequest } from "@/core/prepare-request";
import type { ResponseMode } from "@/core/request-executor";
import { checkTTL } from "@/utils/checkTTL";
import { checkTimeout, raceSignal, requestLifetime } from "@/request/lifecycle";
import type { CachePolicy } from "@/types/cache";
import type { Endpoint, EndpointSpec } from "@/types/endpoint";

/** 缓存准入、身份隔离的 key 与共享传输预算。 */
export async function readRequest(
  state: ClientState,
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
    token,
    explicitAuth,
    generation,
    initialVersion,
  } = context;
  const { method, url, headers } = request;
  const session = state.options.session;
  const policy = endpoint?.options.cache;
  let result: unknown;
  if (policy && !prepared.bypassCache && mode === "data") {
    if (method !== "GET")
      throw new TypeError("Only GET endpoints support caching");
    if (
      (session?.token || session?.ensureFreshToken) &&
      !session.sessionVersion &&
      !anonymous
    )
      throw new TypeError(
        "Cached authenticated endpoints require sessionVersion",
      );
    const settings: CachePolicy = policy === true ? {} : policy;
    checkTTL(settings.ttl ?? state.options.cache?.ttl ?? 30000);
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
      (!headers[state.authHeader] || !!token);
    if (safe) {
      const publicHeaders = { ...headers };
      delete publicHeaders.authorization;
      delete publicHeaders[state.authHeader];
      delete publicHeaders.cookie;
      const alias =
        settings.key?.({
          body: prepared.body,
          query: prepared.query,
          params: prepared.params,
        }) ?? url;
      const key = `${endpoint!.identity}|${JSON.stringify([
        anonymous ? "anonymous" : (initialVersion ?? generation),
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
      result = await state.cache.get(
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
