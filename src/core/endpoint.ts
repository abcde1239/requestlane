import type { EndpointOptions, Endpoint, EndpointSpec } from "@/types/endpoint";
import type { Validator } from "@/types/response";

let nextIdentity = 0;

export function defineEndpoint<T>(
  options: EndpointOptions<{ data: T }> & { validator: Validator<T> },
): Endpoint<{ data: T }>;
export function defineEndpoint<S extends EndpointSpec = {}>(
  options: EndpointOptions<S>,
): Endpoint<S>;
export function defineEndpoint(value: unknown): unknown {
  const options = value as EndpointOptions<{}>;
  if (!options.path) throw new TypeError("Endpoint path is required");
  if (options.cache && options.method !== "GET")
    throw new TypeError("Only GET endpoints support response caching");
  return Object.freeze({
    identity: ++nextIdentity,
    options: Object.freeze({ ...options }),
  });
}
