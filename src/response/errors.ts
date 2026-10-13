import type { ErrorKind, ErrorDetails, ErrorInfo } from "@/types/errors";
import type { TransportResponse } from "@/types/transport";
export type { ErrorKind, ErrorDetails, ErrorInfo } from "@/types/errors";

export class CommunicationError extends Error {
  readonly status?: number;
  readonly businessCode?: number | string;
  readonly suggestedStatus?: number;
  readonly response?: TransportResponse;
  constructor(
    message: string,
    readonly kind: ErrorKind,
    details: ErrorDetails = {},
  ) {
    super(message, { cause: details.cause });
    this.name = "CommunicationError";
    this.status = details.status;
    this.businessCode = details.businessCode;
    this.suggestedStatus = details.suggestedStatus;
    this.response = details.response;
  }
}
export class HttpError extends CommunicationError {
  constructor(response: TransportResponse, cause?: unknown) {
    const value = response.data as { code?: unknown } | null;
    const code =
      value &&
      (typeof value.code === "number" || typeof value.code === "string")
        ? value.code
        : undefined;
    super(`HTTP ${response.status}`, "http", {
      status: response.status,
      response,
      cause,
      businessCode: code,
    });
    this.name = "HttpError";
  }
}
export class InvalidResponseError extends CommunicationError {
  constructor(message = "Invalid response format", cause?: unknown) {
    super(message, "protocol", { cause });
    this.name = "InvalidResponseError";
  }
}
export class ValidationError extends CommunicationError {
  constructor(cause: unknown) {
    super("Validation failed", "validation", { cause });
    this.name = "ValidationError";
  }
}
export class BusinessError<Envelope = unknown> extends CommunicationError {
  constructor(
    readonly envelope: Envelope,
    message = "Business request failed",
    details: Omit<ErrorDetails, "response"> = {},
  ) {
    super(message, "business", details);
    this.name = "BusinessError";
  }
  get code() {
    return this.businessCode;
  }
}
export function cancelled(cause?: unknown): CommunicationError {
  const error = new CommunicationError("Request cancelled", "cancelled", {
    cause,
  });
  error.name = "AbortError";
  return error;
}
export function normalizeError(error: unknown): CommunicationError {
  if (error instanceof CommunicationError) return error;
  const value = error as {
    name?: string;
    code?: string;
    response?: { status: number; data: unknown };
    message?: string;
  } | null;
  if (value?.name === "AbortError" || value?.code === "ERR_CANCELED")
    return cancelled(error);
  if (
    value?.name === "TimeoutError" ||
    value?.code === "ETIMEDOUT" ||
    value?.code === "ECONNABORTED"
  )
    return new CommunicationError("Request timed out", "timeout", {
      cause: error,
    });
  if (value?.response)
    return new CommunicationError(`HTTP ${value.response.status}`, "http", {
      cause: error,
      status: value.response.status,
    });
  return new CommunicationError("Network request failed", "network", {
    cause: error,
  });
}
export function classifyError(error: unknown): ErrorInfo {
  if (!(error instanceof CommunicationError)) {
    const value = error as {
      name?: string;
      code?: string;
      isAxiosError?: boolean;
    } | null;
    if (
      value?.isAxiosError ||
      value?.name === "AbortError" ||
      value?.name === "TimeoutError" ||
      value?.code === "ERR_CANCELED"
    )
      return classifyError(normalizeError(error));
    return {
      kind: "unknown",
      message: error instanceof Error ? error.message : "Unknown error",
      retryable: false,
    };
  }
  return {
    kind: error.kind,
    status: error.status,
    businessCode: error.businessCode,
    suggestedStatus: error.suggestedStatus,
    message: error.message,
    retryable:
      error.kind === "network" ||
      error.kind === "timeout" ||
      error.status === 429 ||
      (error.status !== undefined && error.status >= 500),
  };
}
export function errorMessage(error: unknown): string {
  const info = classifyError(error);
  return info.kind === "cancelled" ? "" : info.message;
}
