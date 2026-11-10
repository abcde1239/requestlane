# 与已有工具配合

[文档首页](../index.md) · [快速开始](./usage.md) · [模块组合](./modules.md)

requestlane 适合统一接口契约、会话与请求缓存。接入已有项目时，先确定现有工具已负责什么，再添加需要的能力。

| 已有工具或需求                       | 建议用法                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Axios 已满足普通 HTTP 请求           | 可以继续使用 Axios；需要端点校验或身份隔离等能力时再接入                             |
| 只需请求与端点校验                   | core + 显式选择的 Axios/Fetch transport                                              |
| TanStack Query、SWR 等已管理查询数据 | 由查询工具管理结果缓存、订阅、刷新与重试；requestlane 负责请求、校验和按需配置的会话 |
| 已有认证 SDK 或 auth store           | 通过回调读取已有 token，复用宿主刷新逻辑                                             |
| 独立异步计算需要缓存                 | 使用 `ReadCache`，无须创建 HTTP 客户端                                               |

## 复用 Axios

已有 Axios 实例可以传给 `createAxiosTransport({ instance })`。requestlane 返回业务数据，并统一处理序列化、响应解析、HTTP 错误和超时；不要直接照搬依赖 AxiosResponse 的业务调用。

Axios 的底层配置和拦截器仍可能影响传输。由 requestlane 管线处理的 URL、body、响应格式、状态判断和超时等配置会覆盖对应实例默认值；应逐项核对已有拦截器，避免重复解包、重复认证或重试。

注入实例或 Axios 配置后，默认绕过请求缓存。只有确认拦截器和默认值不会在缓存 key 之外改变请求身份或表示时，才声明 `cacheSafe: true`，见[缓存与取消](../reference/cache.md#会话与取消)。

## 缓存与重试

同一份查询数据优先由一层管理结果缓存。已有 TanStack Query/SWR 时，从不包含请求缓存的 core 开始；为它的请求函数传入取消信号即可。

下面定义一个可供查询工具调用的请求函数，示例使用公开接口，不配置会话和请求缓存：

```ts
import { createCoreClient, defineEndpoint } from "requestlane/core";
import { createFetchTransport } from "requestlane/fetch";
import { z } from "zod";

const client = createCoreClient({
  baseURL: "https://example.com/api",
  transport: createFetchTransport(),
});

const publicMember = defineEndpoint({
  method: "GET",
  path: "/public/members/:id",
  inputValidators: { params: z.object({ id: z.string() }) },
  validator: z.object({ id: z.string(), name: z.string() }),
});

function loadMember(id: string, signal?: AbortSignal) {
  return client.call(publicMember, { params: { id } }, { signal });
}
```

在查询工具中，将 id 加入查询 key，让查询函数调用 `loadMember(id, signal)`。取消信号的取得方式遵循该工具的 API：TanStack Query 的 queryFn 提供 signal；其他工具按其支持方式传入。

本包的 `withInvalidation` 只失效本包缓存。由 Query 等工具管理结果时，写操作后应调用它们的失效 API。认证数据的查询 key 还应包含身份版本，退出或换号时清理旧身份查询；本包的会话保护不会自动清理外部查询缓存。

requestlane 本身不自动重试。重试与后台刷新交给项目已有的查询工具或 HTTP 插件，并核对具体方法、次数和触发条件。两层各最多尝试 3 次，持续失败时可能放大为 9 次网络尝试；重试写请求前还需确认接口的幂等约定。

## 认证状态

已有 auth store 时，使用 `session.token` 回调读取它；由同一份状态维护身份版本。完整客户端传 `session: { ... }`，core 使用 `createSession({ ... })`，见[动态会话](../reference/session.md#动态会话)。

已有刷新函数时，让 `ensureFreshToken` 调用它，复用已有刷新并发合并。刷新成功后先同步宿主 token，再返回新值；同身份续期保持身份版本不变。登录、退出、换号或权限变化时更新身份版本。

## 取消、超时与原生能力

Axios/Fetch 支持的 AbortSignal 由 transport 接收。requestlane 额外协调共享请求：一个等待者取消只退出自己的等待，最后一个等待者退出才取消共享传输。

requestlane 的默认 15 秒超时覆盖校验、刷新等待和传输，Axios 的传输超时不能覆盖完整过程。Axios transport 已关闭其原生 timeout，由本包管理调用预算；在上层再加超时前，先明确它控制的是整个任务还是单次请求。

需要上传进度、流式响应或其他原生选项时，可直接使用底层库或 transport 的 `native` 入口。native 调用遵循底层 API，会绕过本包的端点校验、会话与缓存处理。

## 框架与服务端实例

React/Vue 本身与查询库的职责不同。是否已有查询缓存、重试或自动刷新，应以项目实际使用的工具和配置为准。

Next.js、Nuxt 等框架的数据获取与缓存行为还取决于版本、运行环境和调用入口。当前 Fetch transport 固定传 `cache: "no-store"`，没有透传框架专属缓存选项；注入框架 fetcher 不代表完整保留其缓存能力。浏览器 HTTP 缓存、框架缓存与本包的显式 TTL 缓存也应分别判断。

浏览器应用可复用客户端。SSR 中携带用户凭证的客户端应按服务端请求创建或注入，避免多个用户共用同一 token 和实例缓存；完成该请求的全部工作后调用 `dispose()`。
