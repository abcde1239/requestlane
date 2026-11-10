import {
  createClient,
  defineEndpoint,
  type ReadonlyData,
  type ResponseType,
  type RequestOptions,
  type EndpointOptions,
  type TransportRequest,
  type Validator,
} from "@";
import { createFetchTransport } from "@/adapters/fetch";
import { z } from "zod";

// 拆分类型后必须仍使用通信包类型，不能意外解析到 DOM 的同名 ResponseType。
const representations: readonly ResponseType[] = [
  "json",
  "text",
  "blob",
  "arraybuffer",
];
for (const responseType of representations) {
  const request: RequestOptions = { responseType };
  const endpoint: EndpointOptions<{}> = {
    method: "GET",
    path: "/types",
    responseType,
  };
  const transport: Omit<TransportRequest, "signal"> = {
    url: endpoint.path,
    method: endpoint.method,
    headers: {},
    responseType: request.responseType ?? "json",
  };
  void transport;
}
// @ts-expect-error DOM 的响应可见性不是通信包的解析格式
const domResponseType: ResponseType = "opaque";
// @ts-expect-error 请求方法必须使用本包 Method，不能退化成 any
const invalidMethod: TransportRequest["method"] = "INVALID";
void [domResponseType, invalidMethod];

// 不作为运行时测试执行；由 strict tsc 同时检查正例与反例。
interface Member {
  id: string;
  profile: { name: string };
}
const client = createClient({ transport: createFetchTransport() });
const detail = defineEndpoint<{
  params: { id: string };
  query: { sort: "latest" | "hot" };
  data: Member;
}>({ method: "GET", path: "/members/:id" });
const result: Promise<ReadonlyData<Member>> = client.call(detail, {
  params: { id: "1" },
  query: { sort: "latest" },
});
const unknownResult: Promise<unknown> = client.get("/untyped");
const inferred = defineEndpoint({
  method: "GET",
  path: "/inferred",
  validator: { parse: () => 1 },
});
const inferredResult: Promise<number> = client.call(inferred, {});
const write = defineEndpoint<{ body: { name: string }; data: Member }>({
  method: "PATCH",
  path: "/members",
});
client.call(write, { body: { name: "new" } });
// @ts-expect-error missing required path params
client.call(detail, { query: { sort: "hot" } });
// @ts-expect-error enum constraint
client.call(detail, { params: { id: "1" }, query: { sort: "wrong" } });
// @ts-expect-error wrong path field type
client.call(detail, { params: { id: 1 }, query: { sort: "hot" } });
// @ts-expect-error fresh object excess field
client.call(write, { body: { name: "new", unknown: 1 } });
// @ts-expect-error GET endpoint cannot declare a request body
defineEndpoint<{ body: string; data: string }>({ method: "GET", path: "/bad" });
// @ts-expect-error caller cannot replace bound endpoint output
client.call<{ data: number }>(detail, {});
// @ts-expect-error undeclared GET body
client.get("/read", { body: {} });
// @ts-expect-error response remains unknown without a static declaration/schema
const unsafe: Promise<Member> = unknownResult;
async function immutable() {
  const value = await result;
  // @ts-expect-error cached/shared data exposes a recursive readonly view
  value.profile.name = "mutation";
}
void [result, inferredResult, unsafe, immutable];
const binary = defineEndpoint<{ data: Blob }>({
  method: "GET",
  path: "/binary",
  responseType: "blob",
});
async function binaryMethods() {
  return (await client.call(binary, {})).arrayBuffer();
}
const binaryResult: Promise<ArrayBuffer> = binaryMethods();
void binaryResult;

const schema = z.object({
  value: z.string().transform((value) => Number(value)),
});
const schemaEndpoint = defineEndpoint({
  method: "GET",
  path: "/schema",
  validator: schema,
});
const schemaResult: Promise<ReadonlyData<z.output<typeof schema>>> =
  client.call(schemaEndpoint, {});
// @ts-expect-error transformed output is number, not the input string
const schemaInputResult: Promise<{ value: string }> = client.call(
  schemaEndpoint,
  {},
);
const asyncSchemaEndpoint = defineEndpoint({
  method: "GET",
  path: "/async-schema",
  validator: { parse: (value: unknown) => schema.parseAsync(value) },
});
const asyncSchemaResult: Promise<ReadonlyData<z.output<typeof schema>>> =
  client.call(asyncSchemaEndpoint, {});
defineEndpoint<{ data: { value: boolean } }>({
  method: "GET",
  path: "/wrong-schema",
  // @ts-expect-error validator output must agree with an explicit data declaration
  validator: schema,
});
void [schemaResult, schemaInputResult, asyncSchemaResult];

// 同一份 schema 推断调用者的原始输入、序列化器的已转换输入与响应输出。
const inferredInputs = defineEndpoint({
  method: "POST",
  path: "/members/:id",
  inputValidators: {
    params: z.object({ id: z.string().transform(Number) }),
    query: z
      .object({ page: z.string().transform(Number) })
      .default({ page: 1 }),
    body: z.object({ age: z.string().transform(Number) }),
  },
  querySerializer: (query) => `page=${query.page.toFixed(0)}`,
  validator: z.object({ id: z.number() }),
});
const inferredInputsResult: Promise<ReadonlyData<{ id: number }>> = client.call(
  inferredInputs,
  {
    params: { id: "1" },
    body: { age: "18" },
  },
);
// @ts-expect-error 缺少必填的原始 body
client.call(inferredInputs, { params: { id: "1" } });
// @ts-expect-error transform 的输出 number 不能代替调用者输入 string
client.call(inferredInputs, { params: { id: "1" }, body: { age: 18 } });
// @ts-expect-error path 参数也从 schema 的输入推断
client.call(inferredInputs, { params: { id: 1 }, body: { age: "18" } });
// @ts-expect-error schema 输出不允许用泛型替换
client.call<{ data: string }>(inferredInputs, {});

const defaultQuery = defineEndpoint({
  method: "GET",
  path: "/default-query",
  inputValidators: {
    query: z.object({ page: z.number() }).default({ page: 1 }),
  },
  validator: z.number(),
});
const defaultQueryResult: Promise<number> = client.call(defaultQuery);
const inferredRead = defineEndpoint({
  method: "GET",
  path: "/members/:id",
  inputValidators: { params: z.object({ id: z.string() }) },
  validator: z.object({ name: z.string() }),
});
// @ts-expect-error 有必填 schema 输入时不能省略参数
client.call(inferredRead);
// @ts-expect-error 未声明的 body 不允许传入
client.call(inferredRead, { params: { id: "1" }, body: {} });
const responseOnly: Promise<ReadonlyData<z.output<typeof schema>>> =
  client.call(schemaEndpoint);
const declaredParser: Validator<number, string> = {
  parse: (value) => Number(value),
};
const customParser = defineEndpoint({
  method: "POST",
  path: "/custom",
  inputValidators: { body: declaredParser },
});
client.call(customParser, { body: "18" });
// @ts-expect-error 自定义 validator 也可以显式声明原始输入类型
client.call(customParser, { body: 18 });

defineEndpoint({
  method: "GET",
  path: "/bad-schema",
  // @ts-expect-error GET 不得声明 body schema
  inputValidators: { body: z.string() },
});
defineEndpoint({
  method: "POST",
  path: "/bad-key",
  // @ts-expect-error 输入校验只接受 body/query/params
  inputValidators: { body: z.string(), other: z.string() },
});
void [inferredInputsResult, defaultQueryResult, responseOnly];

const legacyUnknownBody = defineEndpoint<{ body: unknown }>({
  method: "POST",
  path: "/legacy-unknown",
});
// @ts-expect-error 显式声明的旧 body 字段仍为必填，不因 unknown 类型而放宽
client.call(legacyUnknownBody);
client.call(legacyUnknownBody, { body: undefined });
