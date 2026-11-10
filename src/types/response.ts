export interface SuccessResponse<T> {
  code?: 0;
  msg: string;
  data: T;
}
export interface ErrorResponse {
  code?: number;
  msg: string;
  data?: unknown;
}
export type StandardResponse<T> = SuccessResponse<T> | ErrorResponse;

export interface Validator<T, Input = unknown> {
  /** 仅供输入类型推断；Zod schema 自带此类型标记。 */
  readonly _input?: Input;
  parse(value: unknown): T | Promise<T>;
  /** 存在时优先使用，支持直接传入带异步 refinement 的 Zod schema。 */
  parseAsync?(value: unknown): Promise<T>;
}
export type ValidatorOutput<V extends Validator<unknown>> = Awaited<
  ReturnType<V["parse"]>
>;
export type ValidatorInput<V extends Validator<unknown>> = V extends {
  readonly _input: infer Input;
}
  ? Input
  : "_input" extends keyof V
    ? V extends Validator<unknown, infer Input>
      ? Input
      : never
    : ValidatorOutput<V>;
export interface ResponseCodec<Envelope = unknown> {
  parse(value: unknown): Envelope | Promise<Envelope>;
  unwrap(envelope: Envelope): unknown | Promise<unknown>;
}
