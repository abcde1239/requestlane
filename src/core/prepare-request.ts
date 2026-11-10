import type { ClientState } from "@/core/client-state";

import { mergeHeaders, requestBody, requestURL } from "@/utils/serialization";
import { validate } from "@/response/codec";
import { cancelled } from "@/response/errors";
import { raceSignal } from "@/request/lifecycle";
import type { SessionContext } from "@/core/capabilities";
import type { Endpoint, EndpointSpec } from "@/types/endpoint";
import type { RequestConfig } from "@/types/request";
import type { TransportRequest } from "@/types/transport";

export interface PreparedRequest {
  prepared: RequestConfig;
  request: Omit<TransportRequest, "signal">;
  anonymous: boolean;
  identity?: SessionContext;
  authHeader: string;
  explicitAuth: boolean | undefined;
  generation: number;
  assertCurrent(): void;
  assertSession(): void;
  assertShared(): void;
}

/** 校验输入并取得凭证；本阶段使用消费者的 signal。 */
export async function prepareRequest(
  state: ClientState,
  config: RequestConfig,
  endpoint: Endpoint<EndpointSpec> | undefined,
  signal: AbortSignal,
): Promise<PreparedRequest> {
  signal.throwIfAborted();
  const snapshot = state.session?.begin();
  const generation = state.generation;
  const assertShared = () => {
    if (state.disposed || generation !== state.generation) throw cancelled();
    snapshot?.assertCurrent();
  };
  const assertCurrent = () => {
    signal.throwIfAborted();
    assertShared();
  };
  const validators = endpoint?.options.inputValidators;
  const body = await raceSignal(
    validate(validators?.body, config.body),
    signal,
  );
  const query = await raceSignal(
    validate(validators?.query, config.query),
    signal,
  );
  const params = await raceSignal(
    validate(validators?.params, config.params),
    signal,
  );
  let prepared: RequestConfig = {
    ...config,
    body,
    query,
    params,
    headers: { ...config.headers },
  };
  if (state.options.beforeRequest)
    prepared = await raceSignal(
      Promise.resolve(state.options.beforeRequest(prepared)),
      signal,
    );
  assertCurrent();
  const anonymous = prepared.anonymous ?? false;
  const authHeader = (
    state.options.auth?.header ?? "authorization"
  ).toLowerCase();
  const headers = mergeHeaders(state.options.headers, prepared.headers);
  headers.accept ??=
    (prepared.responseType ?? "json") === "json" ? "application/json" : "*/*";
  const explicitAuth =
    prepared.headers &&
    Object.keys(prepared.headers).some(
      (key) =>
        key.toLowerCase() === "authorization" ||
        key.toLowerCase() === authHeader,
    );
  // 匿名隐私保护是请求基础语义，不依赖会话模块。
  if (anonymous) {
    delete headers.authorization;
    delete headers[authHeader];
  }
  if (!state.session && prepared.sessionToken !== undefined && !anonymous)
    throw new TypeError("Session capability is not configured");
  const identity =
    state.session && snapshot
      ? await state.session.authorize(prepared, headers, snapshot, signal)
      : undefined;
  assertCurrent();
  const assertSession = () => {
    assertCurrent();
    identity?.assertConsumer();
  };
  const method = prepared.method ?? "GET";
  if ((method === "GET" || method === "HEAD") && prepared.body !== undefined)
    throw new TypeError(`${method} cannot have a body`);
  const url = requestURL(
    state.options.baseURL ?? "",
    prepared.url,
    prepared.params,
    prepared.query,
    prepared.querySerializer,
  );
  const request: PreparedRequest["request"] = {
    url,
    method,
    headers,
    body: requestBody(prepared.body, headers),
    responseType: prepared.responseType ?? "json",
    credentials: prepared.credentials ?? state.options.credentials,
  };

  return {
    prepared,
    request,
    anonymous,
    identity,
    authHeader,
    explicitAuth,
    generation,
    assertCurrent,
    assertSession,
    assertShared,
  };
}
