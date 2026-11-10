# requestlane

[![npm version](https://img.shields.io/npm/v/requestlane)](https://www.npmjs.com/package/requestlane)
[![npm downloads](https://img.shields.io/npm/dm/requestlane)](https://www.npmjs.com/package/requestlane)
[![license](https://img.shields.io/npm/l/requestlane)](./LICENSE)

框架无关的 TypeScript HTTP 客户端，提供请求、token 会话与内存缓存管理。

支持 Axios、Fetch、类型端点、Zod 校验、超时与取消。缓存按需开启，使用实例内内存，支持 TTL、并发合并和按标签失效。

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
await fetchClient.post("/members", { name: "Ada" });
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
await axiosClient.patch("/members/1", { name: "新名称" });
```

## 使用缓存与会话

从 0.1.4 起，可从独立入口导入请求、缓存和会话能力，无须分别安装。

```ts
import { createCoreClient, defineEndpoint } from "requestlane/core";
import { createMemoryCache } from "requestlane/cache";
import { createSession } from "requestlane/session";
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
// 第二次读取命中缓存，输入与响应类型由 schema 推断。
cachedClient.invalidate({ tag: "members" });

const sessionClient = createCoreClient({
  baseURL: "https://example.com/api",
  transport: createAxiosTransport(),
  session: createSession(),
});

sessionClient.setToken("access-token");
await sessionClient.get("/me"); // Authorization: Bearer access-token
await sessionClient.get("/public", { anonymous: true });
sessionClient.clearToken();
```

同时使用缓存与动态会话：

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

登录、退出、换号或权限变化时更新 `version`；同身份续期只更新 token。客户端根据身份版本隔离缓存与在途结果。

## 仅使用缓存

```ts
import { ReadCache } from "requestlane/cache";

const cache = new ReadCache(30_000, 20);
const answer = await cache.get("answer", async () => 42);

cache.invalidate({ key: "answer" });
cache.clear();
```

`ReadCache` 可缓存任意异步结果。

## 文档

[使用文档](./USAGE.md)：快速开始、类型与校验、缓存、会话及完整示例。

## 链接

[npm](https://www.npmjs.com/package/requestlane) · [问题反馈](https://github.com/abcde1239/requestlane/issues) · [MIT](./LICENSE)
