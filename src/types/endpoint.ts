import type { CachePolicy } from "@/types/cache";
import type { Method, ResponseType } from "@/types/common";
import type {
  ResponseCodec,
  Validator,
  ValidatorInput,
  ValidatorOutput,
} from "@/types/response";

export interface EndpointSpec {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  data?: unknown;
}
type Field<S, K extends PropertyKey> = K extends keyof S ? S[K] : unknown;
type InputField<S, K extends PropertyKey> = K extends keyof S
  ? {} extends Pick<S, K>
    ? { [P in K]?: S[P] }
    : { [P in K]: S[P] }
  : { [P in K]?: never };
export type EndpointInput<S extends EndpointSpec> = InputField<S, "body"> &
  InputField<S, "query"> &
  InputField<S, "params">;
export type EndpointData<S extends EndpointSpec> = Field<S, "data">;

export interface EndpointInputValidators {
  body?: Validator<unknown>;
  query?: Validator<unknown>;
  params?: Validator<unknown>;
}
export type ValidatedEndpointSpec<V extends EndpointInputValidators, Data> = {
  [K in keyof V & keyof EndpointInputValidators]: ValidatorOutput<
    NonNullable<V[K]>
  >;
} & { data: Data };
type OptionalSchemaFields<Fields> = {
  [K in keyof Fields as undefined extends Fields[K] ? K : never]?: Fields[K];
} & {
  [K in keyof Fields as undefined extends Fields[K] ? never : K]: Fields[K];
};
export type ValidatedEndpointInput<V extends EndpointInputValidators> =
  OptionalSchemaFields<{
    [K in keyof V & keyof EndpointInputValidators]: ValidatorInput<
      NonNullable<V[K]>
    >;
  }>;
export interface EndpointOptions<S extends EndpointSpec> {
  id?: string;
  method: "body" extends keyof S ? Exclude<Method, "GET" | "HEAD"> : Method;
  path: string;
  codec?: ResponseCodec;
  validator?: Validator<EndpointData<S>>;
  inputValidators?: {
    body?: Validator<Field<S, "body">>;
    query?: Validator<Field<S, "query">>;
    params?: Validator<Field<S, "params">>;
  };
  querySerializer?: (query: Field<S, "query">) => string;
  cache?: boolean | CachePolicy;
  timeout?: number;
  anonymous?: boolean;
  responseType?: ResponseType;
}
export interface Endpoint<
  S extends EndpointSpec,
  Input extends EndpointSpec = S,
> {
  readonly options: Readonly<EndpointOptions<S>>;
  readonly identity: number;
  /** 仅供类型推断；函数标记使端点输入输出保持关联。 */
  readonly _types?: (input: S) => S;
  /** 原始输入与校验转换后的字段分开，避免 transform 后要求调用者传输出类型。 */
  readonly _inputTypes?: (input: Input) => Input;
}
