import type {
  EndpointOptions,
  Endpoint,
  EndpointSpec,
  EndpointInputValidators,
  ValidatedEndpointSpec,
  ValidatedEndpointInput,
} from "@/types/endpoint";
import type { Validator } from "@/types/response";

let nextIdentity = 0;

export function defineEndpoint<
  const Inputs extends EndpointInputValidators,
  Data = unknown,
>(
  options: Omit<
    EndpointOptions<ValidatedEndpointSpec<Inputs, Data>>,
    "inputValidators" | "validator"
  > & {
    inputValidators: Inputs &
      Record<Exclude<keyof Inputs, keyof EndpointInputValidators>, never>;
    validator?: Validator<Data>;
  },
): Endpoint<
  ValidatedEndpointSpec<Inputs, Data>,
  ValidatedEndpointInput<Inputs>
>;
export function defineEndpoint<T>(
  options: EndpointOptions<{ data: T }> & {
    validator: Validator<T>;
    inputValidators?: never;
  },
): Endpoint<{ data: T }>;
export function defineEndpoint<S extends EndpointSpec = {}>(
  options: EndpointOptions<S> &
    (Extract<keyof S, keyof EndpointInputValidators> extends never
      ? { inputValidators?: never }
      : unknown),
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
