# requestlane

[![npm version](https://img.shields.io/npm/v/requestlane)](https://www.npmjs.com/package/requestlane)
[![npm downloads](https://img.shields.io/npm/dm/requestlane)](https://www.npmjs.com/package/requestlane)
[![license](https://img.shields.io/npm/l/requestlane)](./LICENSE)

框架无关、模块化的 TypeScript HTTP 客户端。

具有Axios 与 Fetch适配，提供类型安全的 API 端点定义、基于 Zod 的运行时数据校验，以及统一的请求与会话管理。

内置可选的内存缓存，支持 TTL、并发请求合并。

## 安装

```bash
npm install requestlane
```

## 使用 Fetch

```ts
import { createClient } from "requestlane";
import { createFetchTransport } from "requestlane/fetch";

const fetchClient = createClient({
  baseURL: "https://example.com/api",
  transport: createFetchTransport(),
});

const member = await fetchClient.get<{ id: string; name: string }>(
  "/members/1",
);
await fetchClient.post("/members", { name: "abcde" });
```

## 使用 Axios

```ts
import { createClient as createAxiosClient } from "requestlane";
import { createAxiosTransport } from "requestlane/axios";

const axiosClient = createAxiosClient({
  baseURL: "https://example.com/api",
  transport: createAxiosTransport(),
});

const profile = await axiosClient.get<{ id: string; name: string }>(
  "/members/1",
);
await axiosClient.patch("/members/1", { name: "abcde" });
```

以上客户端默认解包响应数据，直接返回业务数据。

## 缓存管理

```ts
import { createCoreClient, defineEndpoint } from "requestlane/core";
import { createMemoryCache } from "requestlane/cache";
import { z } from "zod";

// 也可替换为 createFetchTransport()。
const cachedClient = createCoreClient({
  baseURL: "https://example.com/api",
  transport: createAxiosTransport(),
  cache: createMemoryCache({ ttl: 30_000, capacity: 20 }),
});

const memberDetail = defineEndpoint({
  method: "GET",
  path: "/members/:id",
  inputValidators: { params: z.object({ id: z.string() }) },
  validator: z.object({ id: z.string(), name: z.string() }),
  cache: { tags: ["members"] },
});

const first = await cachedClient.call(memberDetail, { params: { id: "1" } });
const second = await cachedClient.call(memberDetail, { params: { id: "1" } });
// 第二次读取命中缓存，输入与响应由Zod schema 提供类型推断和运行时校验。
cachedClient.invalidate({ tag: "members" });
```

缓存需要同时配置客户端的 `createMemoryCache(...)` 和 GET 端点的 `cache`。

## 会话管理

继续使用上面的 `createCoreClient` 和 Axios transport，添加会话管理：

```ts
import { createSession } from "requestlane/session";

// 也可替换为 createFetchTransport()。
const sessionClient = createCoreClient({
  baseURL: "https://example.com/api",
  transport: createAxiosTransport(),
  session: createSession(),
});

sessionClient.setToken("access-token"); // Authorization: Bearer access-token
await sessionClient.get("/me");
await sessionClient.get("/public", { anonymous: true });
sessionClient.clearToken();
```

## 组合缓存与会话管理

已有登录状态时，用回调读取 token，并用版本标识身份变化：

```ts
const auth = { token: "access-token", version: 1 };

const composedClient = createCoreClient({
  baseURL: "https://example.com/api",
  transport: createAxiosTransport(),
  cache: createMemoryCache(),
  session: createSession({
    token: () => auth.token,
    sessionVersion: () => auth.version,
  }),
});

const current = await composedClient.call(memberDetail, {
  params: { id: "1" },
});
```

登录、退出、换号或权限变化时更新 `version`；同身份续期只更新 token。客户端根据`version`隔离缓存与在途结果。

## 仅使用缓存

```ts
import { ReadCache } from "requestlane/cache";

const cache = new ReadCache(30_000, 20); //ttl,capacity
const answer = await cache.get("answer", async () => 42); //key,default

cache.invalidate({ key: "answer" });
cache.clear();
```

`ReadCache` 可缓存任意异步结果。

## 文档

[在线文档](https://abcde1239.github.io/requestlane/)：快速开始与 Client、Cache、Session、Response、Service API 参考。

[使用文档](./USAGE.md)：快速开始、类型与校验、缓存、会话及完整示例。

已使用 TanStack Query、SWR 或框架数据获取工具时，先看[与已有工具配合](./docs/public/guides/integrations.md)，确定缓存、重试和认证各由哪一层负责。

## 链接

[npm](https://www.npmjs.com/package/requestlane) · [问题反馈](https://github.com/abcde1239/requestlane/issues) · [MIT](./LICENSE)
