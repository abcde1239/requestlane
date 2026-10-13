import type { ResponseCodec, Validator } from "@/types/response";
import {
  CommunicationError,
  InvalidResponseError,
  ValidationError,
} from "@/response/errors";
export const identityCodec: ResponseCodec = {
  parse: (value) => value,
  unwrap: (value) => value,
};
export function createCodec<Envelope>(
  codec: ResponseCodec<Envelope>,
): ResponseCodec<Envelope> {
  return codec;
}
export async function parseEnvelope(
  codec: ResponseCodec,
  value: unknown,
): Promise<unknown> {
  try {
    return await codec.parse(value);
  } catch (error) {
    if (error instanceof CommunicationError) throw error;
    throw new InvalidResponseError("Response codec rejected envelope", error);
  }
}
export async function validate<T>(
  validator: Validator<T> | undefined,
  value: unknown,
): Promise<unknown> {
  if (!validator) return value;
  try {
    return await validator.parse(value);
  } catch (error) {
    throw new ValidationError(error);
  }
}
