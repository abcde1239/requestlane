import type { TransportResponse } from "@/types/transport";

export type ErrorKind =
  | "business"
  | "http"
  | "network"
  | "timeout"
  | "cancelled"
  | "protocol"
  | "validation"
  | "unknown";
export interface ErrorInfo {
  kind: ErrorKind;
  status?: number;
  businessCode?: number | string;
  suggestedStatus?: number;
  message: string;
  retryable: boolean;
}
export interface ErrorDetails {
  cause?: unknown;
  status?: number;
  businessCode?: number | string;
  suggestedStatus?: number;
  response?: TransportResponse;
}
