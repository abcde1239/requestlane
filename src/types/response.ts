export interface SuccessResponse<T> {
  code?: 0
  msg: string
  data: T
}
export interface ErrorResponse {
  code?: number
  msg: string
  data?: unknown
}
export type StandardResponse<T> = SuccessResponse<T> | ErrorResponse

export interface Validator<T> {
  parse(value: unknown): T | Promise<T>
}
export interface ResponseCodec<Envelope = unknown> {
  parse(value: unknown): Envelope | Promise<Envelope>
  unwrap(envelope: Envelope): unknown | Promise<unknown>
}
