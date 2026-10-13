import type { ClientState } from '@/core/client-state'
import type { PreparedRequest } from '@/core/prepare-request'

import type { ResponseMode } from '@/core/request-executor'
import { parseEnvelope, validate } from '@/response/codec'
import {
  BusinessError,
  CommunicationError,
  HttpError,
  InvalidResponseError,
  cancelled,
  normalizeError,
} from '@/response/errors'
import { raceSignal } from '@/request/lifecycle'
import type { ResponseCodec } from '@/types/response'
import type { Endpoint, EndpointSpec } from '@/types/endpoint'
import type { TransportResponse } from '@/types/transport'

/** 共享传输只使用共享 signal，不捕获首个消费者的取消信号。 */
export async function loadResponse(
  state: ClientState,
  context: PreparedRequest,
  mode: ResponseMode,
  codec: ResponseCodec,
  endpoint: Endpoint<EndpointSpec> | undefined,
  transportSignal: AbortSignal,
): Promise<unknown> {
  const { request, generation, initialVersion, anonymous, selectedToken } =
    context
  const session = state.options.session
  let response: TransportResponse
  try {
    response = await raceSignal(
      state.options.transport.send({ ...request, signal: transportSignal }),
      transportSignal,
    )
  } catch (error) {
    throw normalizeError(error)
  }
  transportSignal.throwIfAborted()
  // 共享请求不能引用首个消费者的 signal；只检查共享状态与身份。
  if (
    state.disposed ||
    generation !== state.generation ||
    (session?.sessionVersion && initialVersion !== session.sessionVersion()) ||
    (!anonymous &&
      session?.token &&
      !session.sessionVersion &&
      selectedToken !== state.formatToken(session.token()))
  )
    throw cancelled()
  if (response.status < 200 || response.status >= 300) {
    if (
      response.status === 401 &&
      session?.onUnauthorized &&
      !anonymous &&
      selectedToken &&
      (!session.token || state.formatToken(session.token()) === selectedToken)
    ) {
      try {
        await raceSignal(
          Promise.resolve(session.onUnauthorized()),
          transportSignal,
        )
      } catch {
        /* preserve HTTP failure */
      }
    }
    throw new HttpError(response)
  }
  if (mode === 'raw') return response
  const envelope = await raceSignal(
    parseEnvelope(codec, response.data),
    transportSignal,
  )
  if (mode === 'envelope') return envelope
  let data: unknown
  try {
    data = await raceSignal(
      Promise.resolve(codec.unwrap(envelope)),
      transportSignal,
    )
  } catch (error) {
    if (error instanceof BusinessError && error.status === undefined)
      Object.defineProperty(error, 'status', { value: response.status })
    if (error instanceof CommunicationError || transportSignal.aborted)
      throw error
    throw new InvalidResponseError('Response codec rejected data', error)
  }
  data = await raceSignal(
    validate(endpoint?.options.validator, data),
    transportSignal,
  )
  transportSignal.throwIfAborted()
  if (
    state.disposed ||
    generation !== state.generation ||
    (session?.sessionVersion && initialVersion !== session.sessionVersion())
  )
    throw cancelled()
  return data
}
