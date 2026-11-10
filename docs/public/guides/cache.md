# 内存缓存

[文档首页](../README.md) · [模块组合](./modules.md) · [会话](./sessions.md)

requestlane 提供两种缓存用法：用 `ReadCache` 缓存任意异步结果，或为 HTTP 客户端添加请求缓存能力。两者都使用实例内内存，不默认写入持久化存储。

## 独立缓存

```ts
import { ReadCache } from "requestlane/cache";

const cache = new ReadCache(30_000, 20); // TTL 毫秒、容量

const answer = await cache.get("answer", async () => 42);
const sameAnswer = await cache.get("answer", async () => 100); // 命中时仍返回 42

cache.invalidate({ key: "answer" });
cache.clear();
```

相同 key 的并发调用共享一次 loader，后续调用可在 TTL 内复用成功结果。相同 key 应对应相同数据类型；手动指定 `get<T>` 不会增加运行时校验。

通过第四个参数设置单项 TTL 和标签：

```ts
const total = await cache.get("report:total", async () => 42, undefined, {
  ttl: 5_000,
  tags: ["reports"],
});

cache.invalidate({ tag: "reports" });
cache.invalidate({ prefix: "report:" });
```

## 缓存 HTTP 请求

先配置客户端缓存能力，再在 GET 端点开启缓存：

```ts
import { createCoreClient, defineEndpoint } from "requestlane/core";
import { createAxiosTransport } from "requestlane/axios";
import { createMemoryCache } from "requestlane/cache";
import { z } from "zod";

const client = createCoreClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
  cache: createMemoryCache({ ttl: 30_000, capacity: 20 }),
});

const memberDetail = defineEndpoint({
  method: "GET",
  path: "/members/:id",
  inputValidators: { params: z.object({ id: z.string() }) },
  validator: z.object({ id: z.string(), name: z.string() }),
  cache: { ttl: 10_000, tags: ["members"] },
});

const [first, second] = await Promise.all([
  client.call(memberDetail, { params: { id: "1" } }),
  client.call(memberDetail, { params: { id: "1" } }),
]);
```

上述两个调用共享传输与成功结果。端点应定义一次并复用；每次重新创建端点会产生不同的缓存身份。

根入口的完整客户端改用 `cache: { ttl, capacity }` 配置，无须传工厂，见[模块组合](./modules.md#使用完整客户端)。

## 配置与默认值

| 配置                    | 默认值           | 作用                                      |
| ----------------------- | ---------------- | ----------------------------------------- |
| 客户端 `ttl`            | `30_000` 毫秒    | 缓存有效期，可被端点覆盖                  |
| 客户端 `capacity`       | `20`             | 可复用条目上限，满时按 FIFO 淘汰          |
| 端点 `cache`            | 关闭             | `true` 使用客户端默认值，对象提供单项策略 |
| 端点 `tags`             | `[]`             | 按业务组失效                              |
| 端点 `transportTimeout` | 端点或客户端超时 | 共享传输的时间预算                        |

TTL 从解包和校验成功后开始。`ttl: 0` 只合并在途请求，失败结果不缓存。容量限制不是并发请求上限。

端点还可用 `key(input)` 指定失效别名；该别名不会替代 URL、身份和请求表示等隔离条件。

## 失效与绕过

```ts
client.invalidate({ tag: "members" });
client.invalidate({ endpoint: memberDetail });

const fresh = await client.call(
  memberDetail,
  { params: { id: "1" } },
  { bypassCache: true },
);
```

写请求使用 `withInvalidation`，传入创建请求的函数：

```ts
await client.withInvalidation(["members"], () =>
  client.patch("/members/1", { name: "新名称" }),
);
```

关联缓存会在写请求前和结束后失效，即使写请求失败也会清理。失效还会取消匹配的在途缓存请求，迟到的结果不会恢复旧条目。

## 会话与取消

动态认证请求启用缓存时，需要 `sessionVersion` 标识身份，见[动态会话](./sessions.md#动态会话)。显式认证头、Cookie、单次 `sessionToken` 或不稳定的传输配置会绕过缓存，避免复用无法安全识别的请求。

一个调用取消只退出自己的等待；最后一个调用退出时才中止共享传输。独立 `ReadCache.get` 的第三个参数可传 `AbortSignal`，HTTP 请求使用请求选项中的 `signal`。

每个客户端拥有独立缓存。客户端不再使用时调用 `dispose()`；独立 `ReadCache` 使用 `clear()` 清理。
