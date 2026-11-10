# 模块组合

[文档首页](../index.md) · [Client 与 Core](../reference/client.md) · [包入口](../reference/exports.md)

各模块的使用方式分别见 [Client](../reference/client.md)、[Cache](../reference/cache.md)、[Session](../reference/session.md)、[Response](../reference/response.md) 和 [Service](../reference/service.md)。本页集中说明客户端入口选择与缓存、会话的组合。

所有入口来自同一个 npm 包；Axios、Zod 仍会随包安装，子路径只改变模块加载与初始化。Response 和 Service 是讲解主题，实际导入路径见[包入口参考](../reference/exports.md)。

## 选择入口

| 使用场景                             | 入口                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| 希望直接设置 token，并按端点开启缓存 | `requestlane` 完整客户端                                                         |
| 只需请求、类型端点与校验             | `requestlane/core`                                                               |
| 已有查询工具管理结果缓存             | `requestlane/core`，按需添加会话，见[工具分工](./integrations.md)                |
| 只需缓存任意异步结果                 | `requestlane/cache` 的 `ReadCache`，见[独立缓存](../reference/cache.md#独立缓存) |

## 使用完整客户端

根入口的完整 Client 已配置缓存与会话。配置使用普通对象：

```ts
import { createClient } from "requestlane";
import { createFetchTransport } from "requestlane/fetch";

const fullClient = createClient({
  baseURL: "https://example.com/api",
  transport: createFetchTransport(),
  cache: { ttl: 30_000, capacity: 20 },
  session: { requireToken: false },
});
```

完整客户端仍需在 GET 端点显式开启响应缓存，普通 `get` 不自动缓存。

## 创建请求客户端

core 只配置请求核心，缓存与会话按需添加。创建实例、请求方法、端点和实例生命周期详见 [Client 与 Core](../reference/client.md)。

```ts
import { createCoreClient } from "requestlane/core";

const client = createCoreClient({
  baseURL: "https://example.com/api",
  transport: createFetchTransport(),
});
```

未配置缓存或会话时，不创建对应实例，`client.cache` 为 `undefined`。

## 添加缓存或会话

在 core 的 `cache` 中传 `createMemoryCache(...)`，或在 `session` 中传 `createSession(...)`。独立添加能力的代码分别见 [Cache](../reference/cache.md#为-core-添加缓存) 和 [Session](../reference/session.md#为-core-添加会话)。

这些方法返回能力工厂，可用于多个客户端；每个客户端仍拥有独立的缓存和手动 token。当前不提供跨客户端共享 HTTP 缓存实例的配置。

## 同时使用缓存与会话

```ts
import { defineEndpoint } from "requestlane/core";
import { createMemoryCache } from "requestlane/cache";
import { createSession } from "requestlane/session";
import { z } from "zod";

const composedClient = createCoreClient({
  baseURL: "https://example.com/api",
  transport: createFetchTransport(),
  cache: createMemoryCache({ ttl: 30_000, capacity: 20 }),
  session: createSession(),
});

const memberDetail = defineEndpoint({
  method: "GET",
  path: "/members/:id",
  inputValidators: { params: z.object({ id: z.string() }) },
  validator: z.object({ id: z.string(), name: z.string() }),
  cache: { tags: ["members"] },
});

composedClient.setToken("access-token");
await composedClient.call(memberDetail, { params: { id: "1" } });
```

缓存与会话自动协调身份隔离。退出、换号或权限变化后，旧身份的缓存不会复用。动态 token provider 缓存认证请求时，还需提供 `sessionVersion`，见[动态会话](../reference/session.md#动态会话)。

## 配置形式对照

| 导入入口           | 缓存配置                 | 会话配置                         |
| ------------------ | ------------------------ | -------------------------------- |
| `requestlane`      | `{ ttl, capacity }`      | `{ token, sessionVersion, ... }` |
| `requestlane/core` | `createMemoryCache(...)` | `createSession(...)`             |

端点、请求方法和错误处理可在两种客户端中复用。

## 未配置能力时的行为

| 操作                                                  | 要求                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| 调用开启缓存的端点                                    | 配置缓存能力，否则发送前报错；可用 `bypassCache: true` 绕过 |
| `invalidate`、`withInvalidation`                      | 配置缓存能力                                                |
| `setToken`、`clearToken`、非匿名请求的 `sessionToken` | 配置会话能力                                                |
| 匿名请求 `anonymous: true`                            | 无须会话能力；会移除 Authorization 和配置的认证头           |

```ts
// 本页所有调用结束后，由实例创建者释放。
fullClient.dispose();
client.dispose();
composedClient.dispose();
```
