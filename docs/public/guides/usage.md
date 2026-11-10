# 快速开始

[文档首页](../index.md) · [包入口](../reference/exports.md)

本页以完整客户端为例，从发送请求开始，逐步介绍响应校验、缓存和会话管理。已有 Axios、查询或认证工具时，可参考[与已有工具配合](./integrations.md)，选择适合的接入方式。

## 安装

::: code-group

```sh [npm]
npm install requestlane
```

```sh [pnpm]
pnpm add requestlane
```

```sh [yarn]
yarn add requestlane
```

```sh [bun]
bun add requestlane
```

:::

Axios、Zod 随包自动安装。包采用 ESM，适用于现代浏览器、Node.js 20+ 和 Bun 1.3.4+。完整环境说明见[运行环境](../reference/exports.md#运行环境)。

## 发送第一个请求

```ts
import { createClient } from "requestlane";
import { createFetchTransport } from "requestlane/fetch";

const client = createClient({
  baseURL: "https://example.com/api",
  transport: createFetchTransport(),
});

interface Member {
  id: string;
  name: string;
}

const member = await client.get<Member>("/members/1");
console.log(member.name);
```

假定接口返回 `{ id, name }`。客户端默认拆包并返回普通 JSON 作为业务数据，无须访问 `response.data`。`get<Member>` 语法下只提供编译期类型校验，也不会自动缓存。

## 选择传输

Axios 与 Fetch 均需显式选择。使用 Axios 时替换 transport，其他调用方式相同：

```ts
import { createAxiosTransport } from "requestlane/axios";

const axiosClient = createClient({
  baseURL: "https://example.com/api",
  transport: createAxiosTransport(),
});
```

## 发送数据

继续使用本页的 client：

```ts
await client.post<Member>("/members", { name: "A" });
await client.patch<Member>("/members/1", { name: "新名称" });
await client.delete("/members/1");

const raw = await client.requestRaw<Member>({ url: "/members/1" });
console.log(raw.status, raw.data);
```

`get/post/put/patch/delete` 返回业务数据；`head/requestRaw` 返回带状态、响应头和数据的传输响应。路径参数、文件、响应格式与错误处理见[请求与错误](./advanced.md)。

## 复用客户端

同一个客户端可以供多个业务模块使用。项目按成员、图书等业务拆分后，可将客户端的创建代码放到公共模块，再分别导入。

`http.ts`：创建并导出共享客户端。

```ts
import { createClient } from "requestlane";
import { createFetchTransport } from "requestlane/fetch";

export const client = createClient({
  baseURL: "https://example.com/api",
  transport: createFetchTransport(),
});
```

`member.ts`：请求成员接口。

```ts
import { client } from "./http.js";

export function getMember(id: string) {
  return client.get<{ id: string; name: string }>("/members/:id", {
    params: { id },
  });
}
```

`book.ts`：请求图书接口。

```ts
import { client } from "./http.js";

export function getBook(id: string) {
  return client.get<{ id: string; title: string }>("/books/:id", {
    params: { id },
  });
}
```

同一应用模块图中，`http.ts` 初始化一次；member 和 book 导入的是同一个实例，共用 `baseURL` 和客户端配置。业务模块无须分别调用 `createClient`，由应用在结束使用时统一[释放客户端](#释放客户端)。

以上是拆分文件后的组织方式；本页后续示例继续使用开头创建的 `client`。服务端渲染时的用户实例隔离见[框架与服务端实例](./integrations.md#框架与服务端实例)。

## 端点类型与运行时校验

需要检查实际响应时，继续使用本页的 client，将接口定义为端点并提供 Zod schema：

```ts
import { defineEndpoint } from "requestlane";
import { z } from "zod";

const memberDetail = defineEndpoint({
  method: "GET",
  path: "/members/:id",
  inputValidators: { params: z.object({ id: z.string() }) },
  validator: z.object({ id: z.string(), name: z.string() }),
});

const checkedMember = await client.call(memberDetail, { params: { id: "1" } });
console.log(checkedMember.name); // string，类型来自 schema
```

输入不合法时不发请求，响应不合法时抛出校验错误。schema 同时提供类型，无须再为这个端点声明 Member。转换、默认值和异步校验见[类型与校验](./validation.md)。

## 缓存重复读取

需要复用 GET 端点的结果时，配置 `cache: true`。继续使用本页的 `client`、`defineEndpoint` 和 Zod：

```ts
const cachedMemberDetail = defineEndpoint({
  method: "GET",
  path: "/members/:id",
  inputValidators: { params: z.object({ id: z.string() }) },
  validator: z.object({ id: z.string(), name: z.string() }),
  cache: true,
});

// 第一次调用发送请求，校验成功后缓存结果。
const firstDetail = await client.call(cachedMemberDetail, {
  params: { id: "1" },
});

// TTL 内以相同参数调用同一端点，直接读取缓存。
const secondDetail = await client.call(cachedMemberDetail, {
  params: { id: "1" },
});
```

完整客户端已具备缓存能力，成功结果默认保留 30 秒。`cachedMemberDetail` 定义一次后复用，无须在每次调用时重新创建。

相关数据被修改后，需要失效旧缓存。完整示例和写失效见[内存缓存](../reference/cache.md#缓存-http-请求)。项目已有查询缓存时，先按[工具分工](./integrations.md#缓存与重试)决定由哪一层管理数据。

## 设置 token

完整客户端也可以直接管理 token，继续使用本页的 client：

```ts
client.setToken("access-token");
await client.get("/me");
await client.get("/public", { anonymous: true });
client.clearToken();
```

默认发送 `Authorization: Bearer ...`。已有登录状态或需要处理身份切换时，见[会话](../reference/session.md)；登录与 token 存储由应用负责。

## 按需组合模块

只需要请求与校验，或已有查询工具管理缓存时，使用 `requestlane/core`；需要会话或本包缓存时再添加对应能力。两种入口的选择与配置见[模块组合](./modules.md)。

## 释放客户端

应用或所属模块结束使用，且其他调用方也不再需要这些实例时，释放本页创建的客户端：

```ts
client.dispose();
axiosClient.dispose();
```

`dispose()` 会清空该实例的缓存并取消在途请求。释放后的实例不能继续发送请求，需要再次使用时应创建新实例。

应用级共享客户端应由应用统一释放；单个页面只需取消自己的请求时，使用 [AbortSignal](./advanced.md#超时与取消)。

## 下一步

- [与已有工具配合](./integrations.md)：复用 Axios、查询缓存和认证模块，避免重复管理状态。
- [包入口参考](../reference/exports.md)：配置入口与运行环境。
