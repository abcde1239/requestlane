# 会话

[文档首页](../README.md) · [模块组合](./modules.md) · [内存缓存](./cache.md)

会话能力负责为请求取得凭证、检查身份变化及处理未授权响应。应用负责登录、token 存储和刷新逻辑。

## 设置 token

```ts
import { createCoreClient } from "requestlane/core";
import { createAxiosTransport } from "requestlane/axios";
import { createSession } from "requestlane/session";

const client = createCoreClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
  session: createSession(),
});

client.setToken("access-token");
const profile = await client.get("/me");
await client.get("/public", { anonymous: true });
client.clearToken();
```

默认通过 `Authorization: Bearer ...` 发送凭证。匿名请求跳过会话取 token 与刷新，并移除 Authorization 和配置的认证头。

根入口 `requestlane` 的完整客户端已包含会话能力，可以直接调用 `setToken`。

## 动态会话

已有应用状态时，使用回调提供 token 与身份版本：

```ts
import { createMemoryCache } from "requestlane/cache";

const authState = { token: "", version: 0 };
const authenticatedClient = createCoreClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
  cache: createMemoryCache(),
  session: createSession({
    token: () => authState.token,
    sessionVersion: () => authState.version,
    requireToken: true,
    onUnauthorized() {
      authState.token = "";
      authState.version++;
    },
  }),
});

const login = await authenticatedClient.post<{ token: string }>(
  "/auth/login",
  { identifier: "member", password: "example-password" },
  { anonymous: true },
);

authState.token = login.token;
authState.version++;
const account = await authenticatedClient.get("/me");
```

接口路径与登录字段需替换为应用自己的 API。示例状态保存在内存中，包不决定 token 的持久化位置。

| 状态变化          | token      | sessionVersion |
| ----------------- | ---------- | -------------- |
| 登录、退出或换号  | 更新或清空 | 更新           |
| 权限变化          | 按需更新   | 更新           |
| 同身份 token 续期 | 更新       | 保持不变       |

身份变化后，旧请求结果会被拒绝，旧身份的缓存不会复用。配置缓存能力时由客户端协调失效，无须手动订阅身份变化。动态 token provider 或刷新回调用于认证缓存时，必须提供 `sessionVersion`。

配置 `token` provider 后，它优先于手动 `setToken`，此时应直接更新应用状态。

## 刷新与未授权响应

需要刷新 token 时，在 `createSession` 的选项中提供 `ensureFreshToken`。它返回 `Promise<string>`，负责取得最新 token；若同时配置 `token` provider，应在返回前同步应用状态。

宿主负责刷新并发合并。某个请求取消时，只停止该请求的等待，不会取消其他请求正在等待的刷新。

`onUnauthorized` 处理当前认证请求的 HTTP 401。匿名请求、已过期身份的响应、403 和 503 不会触发当前会话清理。包不会自动重新登录或重放写请求。

## 自定义认证格式

API key 等认证方式可通过客户端的 `auth` 配置：

```ts
const apiKeyClient = createCoreClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
  auth: { header: "X-Api-Key", format: (token) => token },
  session: createSession(),
});

apiKeyClient.setToken("api-key");
await apiKeyClient.get("/resources");
```

单次请求可用 `sessionToken` 覆盖会话凭证；该请求会绕过响应缓存。核心客户端需配置会话能力，匿名请求则忽略该凭证。
