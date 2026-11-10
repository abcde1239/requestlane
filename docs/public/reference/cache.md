# Cache API

[文档首页](../index.md) · [Client API](./client.md) · [Session API](./session.md)

| 导入入口                          | 公开 API                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `requestlane/cache`               | `ReadCache`、`createMemoryCache`、`MemoryCacheOptions`、`CacheReadOptions`、`CacheInvalidationFilter`、`CacheStore` |
| `requestlane`、`requestlane/core` | `CachePolicy`；客户端的 cache、invalidate、withInvalidation                                                         |
| `requestlane/core`                | `CacheFactory` 类型                                                                                                 |

## 独立缓存

### ReadCache

| API                              | 参数                          | 默认值   | 返回值      |
| -------------------------------- | ----------------------------- | -------- | ----------- |
| `new ReadCache(ttl?, capacity?)` | `ttl: number`，有限非负毫秒数 | `30_000` | `ReadCache` |
| 同上                             | `capacity: number`，正整数    | `20`     | 同上        |

| 属性      | 类型          | 说明                                                           |
| --------- | ------------- | -------------------------------------------------------------- |
| `size`    | 只读 `number` | 当前缓存索引内的条目数，含索引内的在途项及尚未读取清理的过期项 |
| `pending` | 只读 `number` | 当前活跃的加载任务数；已被容量淘汰的在途任务仍可计入           |

| 方法                                   | 参数                           | 返回值       | 行为                                                   |
| -------------------------------------- | ------------------------------ | ------------ | ------------------------------------------------------ |
| `get<T>(key, load, signal?, options?)` | 见下表                         | `Promise<T>` | 有效缓存命中时复用结果，相同 key 的在途读取共享 loader |
| `invalidate(filter?)`                  | `CacheInvalidationFilter = {}` | `void`       | 清除匹配项并取消对应在途任务；空过滤器匹配全部         |
| `clear()`                              | 无                             | `void`       | 等同无参数 invalidate                                  |

### get 参数

| 参数      | 类型                                  | 必填 | 默认值 | 说明                                     |
| --------- | ------------------------------------- | ---- | ------ | ---------------------------------------- |
| `key`     | `string`                              | 是   | 无     | 缓存主键；同一 key 应对应同一数据类型    |
| `load`    | `(signal: AbortSignal) => Promise<T>` | 是   | 无     | 未命中时调用；接收共享加载任务的取消信号 |
| `signal`  | `AbortSignal`                         | 否   | 无     | 当前消费者的取消信号                     |
| `options` | `CacheReadOptions`                    | 否   | `{}`   | 新条目的 TTL、标签和失效别名             |

### CacheReadOptions

| 参数    | 类型                | 默认值     | 说明                                      |
| ------- | ------------------- | ---------- | ----------------------------------------- |
| `ttl`   | `number`            | 构造器 ttl | 当前新条目的生存时间，有限非负毫秒数      |
| `tags`  | `readonly string[]` | `[]`       | 按业务组失效的标签                        |
| `alias` | `string`            | key        | 可供 key 过滤器匹配的别名；不替换缓存主键 |

命中已有条目或共享在途任务时沿用原条目的 loader 与策略，不因后续调用传入不同 options 而更新。成功加载后开始计算 TTL；到期后在读取时清理，失败结果移除。`ttl: 0` 仅合并在途加载，不复用已经完成的结果。

### CacheInvalidationFilter

| 参数     | 类型     | 默认值 | 匹配规则                          |
| -------- | -------- | ------ | --------------------------------- |
| `key`    | `string` | 不限制 | 主键或 alias 等于该值             |
| `tag`    | `string` | 不限制 | 条目的 tags 包含该值              |
| `prefix` | `string` | 不限制 | 主键以该值开头，不匹配 alias 前缀 |

多个条件同时提供时须全部匹配。失效不自动重新加载。容量满时按 FIFO 移除索引中的最早条目，不自动取消其仍在进行的加载任务；capacity 不是并发上限。

## 为 Core 添加缓存

| API                           | 参数                 | 默认值 | 返回值         |
| ----------------------------- | -------------------- | ------ | -------------- |
| `createMemoryCache(options?)` | `MemoryCacheOptions` | `{}`   | `CacheFactory` |

### MemoryCacheOptions

| 参数       | 类型     | 默认值   | 说明                                   |
| ---------- | -------- | -------- | -------------------------------------- |
| `ttl`      | `number` | `30_000` | 默认缓存生存时间，单位毫秒，有限非负数 |
| `capacity` | `number` | `20`     | 缓存索引条目上限，正整数，按 FIFO 淘汰 |

| 客户端入口         | cache 参数                                | 默认行为                                    |
| ------------------ | ----------------------------------------- | ------------------------------------------- |
| `requestlane/core` | `CacheFactory`，由 createMemoryCache 返回 | 不传则无缓存能力，cache getter 为 undefined |
| `requestlane`      | `{ ttl?: number; capacity?: number }`     | 自动创建默认内存缓存                        |

工厂可复用，每个客户端初始化独立的 ReadCache。不支持把 ReadCache 实例直接作为 core 的 cache 参数。`CacheStore` 为结构化缓存接口，成员与上面的 size、pending、get、invalidate、clear 相同。

## 缓存 HTTP 请求

| 配置或调用                                                      | 类型或条件            | 行为                       |
| --------------------------------------------------------------- | --------------------- | -------------------------- |
| `defineEndpoint({ cache: false })` 或不配置 cache               | 默认                  | 不缓存                     |
| `defineEndpoint({ cache: true })`                               | 仅 GET                | 使用客户端默认 TTL         |
| `defineEndpoint({ cache: policy })`                             | `CachePolicy`，仅 GET | 使用端点策略               |
| `client.call(endpoint, input, options)`                         | 客户端已配置缓存能力  | 根据端点策略复用或加载结果 |
| `client.get/post/...`、requestData、requestEnvelope、requestRaw | 无端点缓存策略        | 不参与 HTTP 端点缓存       |

缓存内容为解包、校验成功后的结果，TTL 从该过程成功后开始。缓存主键包含端点 identity、身份、URL、失效别名、公共请求头、credentials、responseType 和超时策略等；token 本身不进入主键。每次重新定义端点会生成新 identity。

## 配置与默认值

### CachePolicy

| 参数               | 类型                         | 默认值                                   | 说明                                                                                                |
| ------------------ | ---------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `ttl`              | `number`                     | 客户端 ttl，默认 `30_000`                | 端点结果生存时间；`0` 仅合并在途请求                                                                |
| `tags`             | `readonly string[]`          | `[]`                                     | 关联业务组的失效标签                                                                                |
| `key`              | `(input: unknown) => string` | 最终 URL                                 | 返回失效别名；实际 input 含校验后的 body、query、params；别名也参与主键组成，但不替代身份等隔离字段 |
| `transportTimeout` | `number`                     | 端点 timeout → 客户端 timeout → `15_000` | 共享传输与响应处理预算，有限非负毫秒数；`0` 关闭                                                    |

## 失效与绕过

| 客户端 API                                     | 参数                                                                            | 返回值                 | 行为                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------- |
| `invalidate(filter?)`                          | `{ key?: string; tag?: string; endpoint?: { readonly identity: number } } = {}` | `void`                 | 清除匹配缓存并取消匹配在途任务；空对象失效全部 |
| `withInvalidation<T>(tags, write)`             | `tags: readonly string[]`；`write: () => Promise<T>`，均必填                    | `Promise<T>`           | 写操作前及 finally 中失效 tags；写失败同样清理 |
| `call(endpoint, input, { bypassCache: true })` | 单次 RequestOptions                                                             | 按端点类型返回 Promise | 直接请求，不读取、更新或删除已有缓存           |

| client.invalidate 字段 | 匹配规则                           |
| ---------------------- | ---------------------------------- |
| `key`                  | 缓存主键或策略 key 生成的失效别名  |
| `tag`                  | 业务标签                           |
| `endpoint`             | 指定端点 identity 对应的全部缓存项 |

客户端失效过滤器不含 prefix；底层 `client.cache.invalidate` 使用 CacheInvalidationFilter，支持 prefix。多个过滤条件取交集。

## 会话与取消

| 条件                                                                 | 行为                                   |
| -------------------------------------------------------------------- | -------------------------------------- |
| 单个消费者取消                                                       | 退出自己的等待，其他消费者继续         |
| 最后一个在途消费者取消                                               | 中止共享加载任务                       |
| 标签、key、端点失效，或 clear/dispose                                | 取消匹配的在途任务，迟到结果不恢复缓存 |
| 会话身份变化                                                         | 清空该客户端缓存，拒绝旧身份结果       |
| 动态 token/刷新回调用于非匿名端点缓存，缺少 sessionVersion           | TypeError                              |
| 单次显式认证头、Cookie、sessionToken 或 transport.cacheSafe 为 false | 绕过 HTTP 缓存                         |
| 无法安全识别的认证头组合                                             | 绕过 HTTP 缓存                         |

独立缓存通过 get 的第三个参数接收消费者 signal；HTTP 请求使用 RequestOptions.signal。动态会话字段见 [Session](./session.md#动态会话)。缓存按客户端实例隔离，使用内存，不默认持久化。

## 错误行为

| 条件                                                  | 结果                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| ttl 非有限数或小于 0                                  | TypeError；构造或读取时校验                                 |
| capacity 不是正整数                                   | 创建 ReadCache 或初始化客户端缓存能力时抛 TypeError         |
| transportTimeout 非有限非负数                         | 读取缓存端点时抛 TypeError                                  |
| core 未配置缓存能力却执行 invalidate/withInvalidation | TypeError                                                   |
| core 未配置缓存能力却调用缓存端点，且未 bypass        | 发送前抛 TypeError                                          |
| loader 拒绝                                           | 当前读取拒绝，失败结果移除                                  |
| 取消或失效                                            | 当前等待拒绝；取消识别见 [Response](./response.md#错误处理) |
