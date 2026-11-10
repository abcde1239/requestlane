# Client：端点类型与校验

[文档首页](../index.md) · [Client 与 Core](../reference/client.md) · [Response](../reference/response.md)

使用 `defineEndpoint` 描述接口，将 Zod schema 传入 `inputValidators` 和 `validator`，即可获得请求输入校验、响应校验与 TypeScript 类型推断。

本页是 Client 的端点配套说明。`validator` 检查 codec 解包后的业务字段；统一响应外层的解析与解包见 [Response](../reference/response.md)。

## 定义端点

```ts
import { createClient, defineEndpoint } from "requestlane";
import { createAxiosTransport } from "requestlane/axios";
import { z } from "zod";

const client = createClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
});

const memberDetail = defineEndpoint({
  method: "GET",
  path: "/members/:id",
  inputValidators: {
    params: z.object({ id: z.string().min(1) }),
  },
  validator: z.object({ id: z.string(), name: z.string() }),
});

const member = await client.call(memberDetail, {
  params: { id: "1" },
});

console.log(member.name); // string
```

| 字段                     | 校验内容             |
| ------------------------ | -------------------- |
| `inputValidators.params` | 路径参数             |
| `inputValidators.query`  | 查询参数             |
| `inputValidators.body`   | 请求体               |
| `validator`              | 协议解包后的响应数据 |

请求输入未通过校验时，不会发送请求。响应未通过校验时，不会写入缓存。`call` 的结果提供只读类型视图，需要编辑数据时先复制。

本页沿用快速开始的完整客户端；只需请求与校验时也可使用[核心客户端](./modules.md#创建请求客户端)，端点和调用方式相同。

## 转换输入

调用参数采用 schema 的输入类型，发送请求时使用校验后的值：

```ts
const updateMember = defineEndpoint({
  method: "PATCH",
  path: "/members/:id",
  inputValidators: {
    params: z.object({ id: z.string() }),
    body: z.object({ age: z.string().regex(/^\d+$/).transform(Number) }),
  },
  validator: z.object({ id: z.string(), age: z.number() }),
});

const updated = await client.call(updateMember, {
  params: { id: "1" },
  body: { age: "18" },
});

console.log(updated.age); // number；请求体中的 age 也是数字
```

不需要另外声明 interface、端点泛型或 `z.output`。若配置 `querySerializer`，它接收转换后的 query。

## 默认值与可选输入

schema 接受 `undefined` 时，对应的输入字段可以省略；没有必填字段时，可以省略整个输入对象：

```ts
const listMembers = defineEndpoint({
  method: "GET",
  path: "/members",
  inputValidators: {
    query: z.object({ page: z.number().int().positive() }).default({ page: 1 }),
  },
  validator: z.array(z.object({ id: z.string() })),
});

const members = await client.call(listMembers); // query 为 { page: 1 }
```

## 异步校验

带异步 refinement 或 transform 的 Zod schema 可以直接传入：

```ts
const positiveCount = defineEndpoint({
  method: "GET",
  path: "/count",
  validator: z.number().refine(async (value) => value > 0),
});

const count = await client.call(positiveCount);
```

校验器提供 `parseAsync` 时优先使用；否则调用 `parse`。无须手动包装 Zod 的异步方法。

## 自定义校验器

校验器可以只提供 `parse(value)`，返回值允许 Promise。输入与输出不同的校验器可用 `Validator<Output, Input>` 声明：

```ts
import type { Validator } from "requestlane/core";

const integer: Validator<number, string> = {
  parse(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
      throw new TypeError("Expected an integer string");
    }
    return Number(value);
  },
};

const saveCount = defineEndpoint({
  method: "POST",
  path: "/count",
  inputValidators: { body: integer },
});

await client.call(saveCount, { body: "18" });
```

校验失败时抛出 `ValidationError`，原始错误保留在 `cause` 中。使用 Zod 时，可从 `cause` 读取 `ZodError.issues`。

## 只使用静态类型

没有运行时校验需求时，可以显式定义端点类型，或为请求方法提供泛型：

```ts
const typedDetail = defineEndpoint<{
  params: { id: string };
  data: { id: string; name: string };
}>({ method: "GET", path: "/members/:id" });

const typedMember = await client.call(typedDetail, { params: { id: "1" } });
const uncheckedMember = await client.get<{ id: string; name: string }>(
  "/members/1",
);
```

这两种写法只提供编译期约束，不会验证服务器返回的数据。未声明响应类型时，结果为 `unknown`。
