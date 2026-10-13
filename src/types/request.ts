import type { Method, ResponseType } from "@/types/common";

export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  anonymous?: boolean;

  /**
   *
   *  一般为用于会话连接的auth token
   * @type {string}
   * @memberof RequestOptions
   */
  sessionToken?: string;
  bypassCache?: boolean;
  headers?: Readonly<Record<string, string>>;
  credentials?: RequestCredentials;
  responseType?: ResponseType;
  onError?: (error: unknown) => void | Promise<void>;
}
export interface RequestConfig<
  Body = unknown,
  Query = unknown,
  Params = unknown,
> extends RequestOptions {
  url: string;
  method?: Method;
  body?: Body;
  query?: Query;
  params?: Params;
  querySerializer?: (query: Query) => string;
}
