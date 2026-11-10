# 模块组合

[文档首页](../README.md) · [快速开始](./usage.md) · [包入口](../reference/exports.md)

requestlane 使用一个 npm 包提供多个导入入口。`requestlane/core` 创建请求客户端，缓存和会话按需添加。Axios、Zod 仍会随包安装，选择子路径只改变模块的加载与初始化。

## 创建请求客户端

```ts
import { createCoreClient } from "requestlane/core";
import { createAxiosTransport } from "requestlane/axios";

const client = createCoreClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
});

const result = await client.get<{ name: string }>("/members/1");
```

核心入口支持请求、端点、运行时校验、超时和取消。未配置缓存或会话时，不创建对应实例，`client.cache` 为 `undefined`。

`createCoreClient` 返回 `CoreClient`，也可通过同一入口的别名 `createClient` 创建。

## 添加缓存或会话

```ts
import { createMemoryCache } from "requestlane/cache";
import { createSession } from "requestlane/session";

const cachedClient = createCoreClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
  cache: createMemoryCache({ ttl: 30_000, capacity: 20 }),
});

const sessionClient = createCoreClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
  session: createSession(),
});

sessionClient.setToken("access-token");
await sessionClient.get("/me");
```

`createMemoryCache` 提供请求缓存能力。响应是否缓存，由 GET 端点的 `cache` 设置决定，见[内存缓存](./cache.md)。

`createSession` 提供凭证与身份管理。需要从应用状态读取 token 时，传入 `token` 回调，见[会话](./sessions.md)。

## 同时使用缓存与会话

```ts
const composedClient = createCoreClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
  cache: createMemoryCache({ ttl: 30_000, capacity: 20 }),
  session: createSession(),
});

composedClient.setToken("access-token");
```

缓存与会话会自动协调身份隔离。使用动态 token provider 缓存认证请求时，还需提供 `sessionVersion`，见[动态会话](./sessions.md#动态会话)。

工厂可以复用，每个客户端仍拥有独立的缓存和手动 token。当前不提供跨客户端共享 HTTP 缓存实例的配置。

## 使用完整客户端

根入口 `requestlane` 提供完整 `Client`，创建时已配置缓存和会话能力，沿用普通对象配置：

```ts
import { createClient as createFullClient } from "requestlane";

const fullClient = createFullClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
  cache: { ttl: 30_000, capacity: 20 },
  session: { token: () => "access-token" },
});
```

| 导入入口           | 缓存配置                 | 会话配置                         |
| ------------------ | ------------------------ | -------------------------------- |
| `requestlane`      | `{ ttl, capacity }`      | `{ token, sessionVersion, ... }` |
| `requestlane/core` | `createMemoryCache(...)` | `createSession(...)`             |

端点、请求方法和错误处理可在两种客户端中复用。完整客户端仍需在端点显式开启响应缓存。

## 未配置能力时的行为

| 操作                                                  | 要求                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| 调用开启缓存的端点                                    | 配置缓存能力，否则发送前报错；可用 `bypassCache: true` 绕过 |
| `invalidate`、`withInvalidation`                      | 配置缓存能力                                                |
| `setToken`、`clearToken`、非匿名请求的 `sessionToken` | 配置会话能力                                                |
| 匿名请求 `anonymous: true`                            | 无须会话能力；会移除 Authorization 和配置的认证头           |

客户端不再使用时调用 `dispose()`。应用可在模块中持有并复用一个客户端，无须每次请求重新创建。
