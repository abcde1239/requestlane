import type { ClientState } from "@/core/client-state";
import type { PreparedRequest } from "@/core/prepare-request";

import type { ResponseMode } from "@/core/request-executor";
import { parseEnvelope, validate } from "@/response/codec";
import {
  BusinessError,
  CommunicationError,
  HttpError,
  InvalidResponseError,
  normalizeError,
} from "@/response/errors";
import { raceSignal } from "@/request/lifecycle";
import type { ResponseCodec } from "@/types/response";
import type { Endpoint, EndpointSpec } from "@/types/endpoint";
import type { TransportResponse } from "@/types/transport";

/** 共享传输只使用共享 signal，不捕获首个消费者的取消信号。 */
export async function loadResponse(
  state: ClientState,
  context: PreparedRequest,
  mode: ResponseMode,
  codec: ResponseCodec,
  endpoint: Endpoint<EndpointSpec> | undefined,
  transportSignal: AbortSignal,
): Promise<unknown> {
  const { request, identity } = context;
  let response: TransportResponse;
  try {
    response = await raceSignal(
      state.options.transport.send({ ...request, signal: transportSignal }),
      transportSignal,
    );
  } catch (error) {
    throw normalizeError(error);
  }
  transportSignal.throwIfAborted();
  context.assertShared();
  identity?.assertResponse();
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401 && identity) {
      try {
        await identity.unauthorized(transportSignal);
      } catch {
        /* preserve HTTP failure */
      }
    }
    throw new HttpError(response);
  }
  if (mode === "raw") return response;
  const envelope = await raceSignal(
    parseEnvelope(codec, response.data),
    transportSignal,
  );
  if (mode === "envelope") return envelope;
  let data: unknown;
  try {
    data = await raceSignal(
      Promise.resolve(codec.unwrap(envelope)),
      transportSignal,
    );
  } catch (error) {
    if (error instanceof BusinessError && error.status === undefined)
      Object.defineProperty(error, "status", { value: response.status });
    if (error instanceof CommunicationError || transportSignal.aborted)
      throw error;
    throw new InvalidResponseError("Response codec rejected data", error);
  }
  data = await raceSignal(
    validate(endpoint?.options.validator, data),
    transportSignal,
  );
  transportSignal.throwIfAborted();
  context.assertShared();
  return data;
}
