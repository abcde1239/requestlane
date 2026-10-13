import type { ClientState } from "@/core/client-state";

import { mergeHeaders, requestBody, requestURL } from "@/utils/serialization";
import { validate } from "@/response/codec";
import { cancelled, CommunicationError } from "@/response/errors";
import { raceSignal } from "@/request/lifecycle";
import type { Scope } from "@/types/common";
import type { Endpoint, EndpointSpec } from "@/types/endpoint";
import type { RequestConfig } from "@/types/request";
import type { TransportRequest } from "@/types/transport";

export interface PreparedRequest {
  prepared: RequestConfig;
  request: Omit<TransportRequest, "signal">;
  anonymous: boolean;
  token: string;
  selectedToken: string;
  explicitAuth: boolean | undefined;
  generation: number;
  initialVersion: Scope | undefined;
  assertCurrent(): void;
  assertSession(): void;
}

/** 校验输入并取得凭证；本阶段使用消费者的 signal。 */
export async function prepareRequest(
  state: ClientState,
  config: RequestConfig,
  endpoint: Endpoint<EndpointSpec> | undefined,
  signal: AbortSignal,
): Promise<PreparedRequest> {
  signal.throwIfAborted();
  const session = state.options.session;
  const initialVersion = session?.sessionVersion?.();
  if (initialVersion !== state.observedScope) {
    state.cache.clear();
    state.observedScope = initialVersion;
  }
  const generation = state.generation;
  const assertCurrent = () => {
    signal.throwIfAborted();
    if (
      state.disposed ||
      generation !== state.generation ||
      (session?.sessionVersion && initialVersion !== session.sessionVersion())
    )
      throw cancelled();
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
  let token = anonymous
    ? ""
    : prepared.sessionToken !== undefined
      ? prepared.sessionToken
      : session?.token
        ? session.token()
        : state.manualToken;
  if (
    !anonymous &&
    prepared.sessionToken === undefined &&
    session?.ensureFreshToken
  ) {
    token = await raceSignal(session.ensureFreshToken(), signal);
    assertCurrent();
    if (
      session.token &&
      state.formatToken(token) !== state.formatToken(session.token())
    )
      throw cancelled();
  }
  if (!anonymous && session?.requireToken && !token)
    throw new CommunicationError("Authentication required", "http", {
      status: 401,
    });
  const headers = mergeHeaders(state.options.headers, prepared.headers);
  headers.accept ??=
    (prepared.responseType ?? "json") === "json" ? "application/json" : "*/*";
  const explicitAuth =
    prepared.headers &&
    Object.keys(prepared.headers).some(
      (key) =>
        key.toLowerCase() === "authorization" ||
        key.toLowerCase() === state.authHeader,
    );
  if (anonymous || session) {
    delete headers.authorization;
    delete headers[state.authHeader];
    if (token) headers[state.authHeader] = state.formatToken(token);
  } else if (!headers[state.authHeader] && token)
    headers[state.authHeader] = state.formatToken(token);
  const selectedToken = state.formatToken(token);
  const assertSession = () => {
    assertCurrent();
    // provider 未给代次时仍阻止旧凭证响应；有代次时允许同身份续期。
    if (
      !anonymous &&
      session?.token &&
      !session.sessionVersion &&
      prepared.sessionToken === undefined &&
      selectedToken !== state.formatToken(session.token())
    )
      throw cancelled();
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
    token,
    selectedToken,
    explicitAuth,
    generation,
    initialVersion,
    assertCurrent,
    assertSession,
  };
}
