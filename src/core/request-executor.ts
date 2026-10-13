import type { ClientState } from "@/core/client-state";
import type { Endpoint, EndpointSpec } from "@/types/endpoint";
import type { RequestConfig } from "@/types/request";
import type { ResponseCodec } from "@/types/response";
import { identityCodec } from "@/response/codec";
import {
  BusinessError,
  CommunicationError,
  cancelled,
  normalizeError,
} from "@/response/errors";
import { checkTimeout, raceSignal, requestLifetime } from "@/request/lifecycle";
import { prepareRequest } from "@/core/prepare-request";
import { loadResponse } from "@/core/load-response";
import { readRequest } from "@/core/cached-request";

export type ResponseMode = "raw" | "envelope" | "data";

/** 编排调用预算、错误观察与清理，各阶段由独立模块负责。 */
export class RequestExecutor {
  constructor(readonly state: ClientState) {}

  async execute(
    config: RequestConfig,
    mode: ResponseMode,
    codec = identityCodec,
    endpoint?: Endpoint<EndpointSpec>,
  ): Promise<unknown> {
    if (this.state.disposed) throw cancelled();
    checkTimeout(config.timeout ?? this.state.options.timeout ?? 15000);
    const controller = new AbortController();
    this.state.lifetimes.add(controller);
    const lifetime = requestLifetime(
      { signal: controller.signal, timeout: config.timeout },
      this.state.options.timeout ?? 15000,
    );
    const cancel = () => controller.abort(config.signal?.reason ?? cancelled());
    if (config.signal?.aborted) cancel();
    else config.signal?.addEventListener("abort", cancel, { once: true });
    try {
      const work = this.perform(config, mode, codec, endpoint, lifetime.signal);
      return await raceSignal(work, lifetime.signal);
    } catch (error) {
      const failure = lifetime.signal.aborted
        ? lifetime.signal.reason
        : error instanceof TypeError ||
            error instanceof BusinessError ||
            error instanceof CommunicationError
          ? error
          : normalizeError(error);
      // 观察器只执行一次；其错误不替换原错误，且仍受调用预算约束。
      const observer = config.onError ?? this.state.options.onError;
      if (observer) {
        try {
          await raceSignal(
            Promise.resolve().then(() => observer(failure)),
            lifetime.signal,
          );
        } catch {
          /* preserve failure */
        }
      }
      throw failure;
    } finally {
      lifetime.dispose();
      config.signal?.removeEventListener("abort", cancel);
      this.state.lifetimes.delete(controller);
    }
  }

  private async perform(
    config: RequestConfig,
    mode: ResponseMode,
    codec: ResponseCodec,
    endpoint: Endpoint<EndpointSpec> | undefined,
    signal: AbortSignal,
  ): Promise<unknown> {
    const context = await prepareRequest(this.state, config, endpoint, signal);
    // 阶段之间也可能发生取消或换号，进入传输前重新检查消费者状态。
    context.assertCurrent();
    const load = (transportSignal: AbortSignal) =>
      loadResponse(this.state, context, mode, codec, endpoint, transportSignal);
    const result = await readRequest(
      this.state,
      context,
      mode,
      endpoint,
      signal,
      load,
    );
    context.assertSession();
    return result;
  }
}
