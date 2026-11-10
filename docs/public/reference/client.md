# Client（Core）API

[文档首页](../index.md) · [快速开始](../guides/usage.md) · [类型与校验](../guides/validation.md)

本页列出客户端、请求配置、端点及传输接口。缓存、会话和响应处理分别见 [Cache](./cache.md)、[Session](./session.md)、[Response](./response.md)。

## 创建客户端

| API                         | 导入入口           | 参数                      | 返回值                       |
| --------------------------- | ------------------ | ------------------------- | ---------------------------- |
| `createClient(options)`     | `requestlane`      | `ClientOptions`，必填     | `Client`，内置缓存与会话     |
| `new Client(options)`       | `requestlane`      | 同上                      | `Client`                     |
| `createCoreClient(options)` | `requestlane/core` | `CoreClientOptions`，必填 | `CoreClient`，按配置添加能力 |
| `createClient(options)`     | `requestlane/core` | 同 `createCoreClient`     | `CoreClient`，该函数为别名   |
| `new CoreClient(options)`   | `requestlane/core` | `CoreClientOptions`，必填 | `CoreClient`                 |

`Client` 继承 `CoreClient`，两者具有相同的请求方法。完整客户端的缓存能力不等于所有请求自动缓存。

### 公共配置 RequestClientOptions

两类客户端均接受以下字段。完整客户端对应 `ClientOptions`；core 对应 `CoreClientOptions`。

| 参数            | 类型                                                       | 必填 | 默认值                   | 说明                                                           |
| --------------- | ---------------------------------------------------------- | ---- | ------------------------ | -------------------------------------------------------------- |
| `transport`     | `Transport`                                                | 是   | 无                       | 显式提供 Axios、Fetch 或自定义传输                             |
| `baseURL`       | `string`                                                   | 否   | `""`                     | 相对请求路径的公共前缀；绝对请求 URL 不拼此前缀                |
| `headers`       | `Readonly<Record<string, string>>`                         | 否   | `{}`                     | 公共请求头，与单次请求头按不区分大小写的名称合并               |
| `timeout`       | `number`                                                   | 否   | `15_000`                 | 调用超时，单位毫秒；有限非负数，`0` 关闭                       |
| `credentials`   | `RequestCredentials`                                       | 否   | Fetch 为 `"same-origin"` | 凭证模式；Axios 不支持保证 `"omit"` 的语义                     |
| `codec`         | `ResponseCodec`                                            | 否   | `identityCodec`          | 默认响应协议，不自动拆解 `data`                                |
| `auth`          | `{ header?: string; format?: (token: string) => string }`  | 否   | Authorization / Bearer   | 认证头与 token 格式，见 [Session](./session.md#自定义认证格式) |
| `beforeRequest` | `(config: RequestConfig) => RequestConfig`，可返回 Promise | 否   | 无                       | 输入校验后、发送前调整请求配置                                 |
| `onError`       | `(error: unknown) => void`，可返回 Promise                 | 否   | 无                       | 错误观察回调；回调报错不替换原错误，仍受调用预算约束           |

`RequestClientOptions` 从 `requestlane/core` 导入；`ClientOptions` 从 `requestlane` 导入。

### 能力配置

| 参数      | `ClientOptions`                       | `CoreClientOptions` | 未传时                                  |
| --------- | ------------------------------------- | ------------------- | --------------------------------------- |
| `cache`   | `{ ttl?: number; capacity?: number }` | `CacheFactory`      | 完整客户端创建默认内存缓存；core 不创建 |
| `session` | `SessionOptions`                      | `SessionFactory`    | 完整客户端创建默认会话；core 不创建     |

core 的工厂由 `createMemoryCache(...)` 和 `createSession(...)` 返回。配置形式与组合示例见[模块组合](../guides/modules.md)。

## 请求方法

表中 `D`、`B`、`Q`、`P` 分别表示响应数据、请求体、查询参数和路径参数类型，默认均为 `unknown`。`GetConfig<Q>` 表示 `Omit<RequestConfig<never, Q>, "url" | "method" | "body">`；`WriteConfig<B, Q>` 表示 `Omit<RequestConfig<B, Q>, "url" | "method" | "body">`，是本页的简写，不是包导出的类型。

| 方法签名                                      | 参数与默认值                                                             | 返回值                                   |
| --------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| `get<D, Q>(url, config?)`                     | `url: string`；`config: GetConfig<Q> = {}`                               | `Promise<D>`                             |
| `post<D, B, Q>(url, body?, config?)`          | `body?: B`；`config: WriteConfig<B, Q> = {}`                             | `Promise<D>`                             |
| `put<D, B, Q>(url, body?, config?)`           | 同 `post`，方法为 PUT                                                    | `Promise<D>`                             |
| `patch<D, B, Q>(url, body?, config?)`         | 同 `post`，方法为 PATCH                                                  | `Promise<D>`                             |
| `delete<D, Q>(url, config?)`                  | 同 `get`，方法为 DELETE                                                  | `Promise<D>`                             |
| `head(url, config?)`                          | `url: string`；`config: RequestOptions = {}`                             | `Promise<TransportResponse>`             |
| `requestRaw<D, B, Q, P>(config)`              | `config: RequestConfig<B, Q, P>`，必填                                   | `Promise<TransportResponse<D>>`          |
| `requestEnvelope<E, B, Q, P>(config, codec?)` | `E` 默认为 `unknown`；`config` 同上；codec 默认继承客户端                | `Promise<E>`                             |
| `requestData<D, B, Q, P>(config, codec?)`     | `config` 同上；`codec?: ResponseCodec`，默认继承客户端                   | `Promise<D>`                             |
| `call(endpoint, input?, options?)`            | 端点必填；input 是否可省略由端点输入决定；`options: RequestOptions = {}` | `Promise<ReadonlyData<EndpointData<S>>>` |

所有 url 参数均为必填 string。`get/post/put/patch/delete` 委托 `requestData`。直接请求方法不使用端点缓存；`call` 执行端点配置的校验和缓存策略。泛型只提供静态约束，实际值的校验由 schema 或 codec 执行。返回层次详见 [Response](./response.md#选择返回层次)。

## 请求参数

### RequestConfig

`RequestConfig<Body = unknown, Query = unknown, Params = unknown>` 继承下面的 `RequestOptions`。

| 参数              | 类型                       | 必填 | 默认值      | 说明                                                 |
| ----------------- | -------------------------- | ---- | ----------- | ---------------------------------------------------- |
| `url`             | `string`                   | 是   | 无          | 请求路径或完整 URL                                   |
| `method`          | `Method`                   | 否   | `"GET"`     | GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS         |
| `body`            | `Body`                     | 否   | `undefined` | 请求体；GET 和 HEAD 携带 body 时抛 TypeError         |
| `query`           | `Query`                    | 否   | `undefined` | 查询参数；默认支持普通对象中的基本值和基本值数组     |
| `params`          | `Params`                   | 否   | `undefined` | 替换路径中的 `:name`；缺少占位参数时抛 TypeError     |
| `querySerializer` | `(query: Query) => string` | 否   | 内置序列化  | 嵌套查询结构需提供；端点调用时接收校验转换后的 query |

### RequestOptions

以下字段均为可选项。

| 参数           | 类型                                       | 默认值                     | 说明                                             |
| -------------- | ------------------------------------------ | -------------------------- | ------------------------------------------------ |
| `signal`       | `AbortSignal`                              | 无                         | 当前调用的取消信号                               |
| `timeout`      | `number`                                   | 端点配置或客户端配置       | 单次调用预算，有限非负毫秒数，`0` 关闭           |
| `headers`      | `Readonly<Record<string, string>>`         | 无                         | 覆盖同名公共头                                   |
| `credentials`  | `RequestCredentials`                       | 客户端配置                 | `"omit"`、`"same-origin"`、`"include"`           |
| `responseType` | `ResponseType`                             | `"json"`，端点可设置默认值 | 传输层响应解析格式                               |
| `anonymous`    | `boolean`                                  | `false`，端点可设置默认值  | 跳过会话凭证和刷新，移除认证头                   |
| `sessionToken` | `string`                                   | 无                         | 单次会话凭证；非匿名请求需要会话能力，且绕过缓存 |
| `bypassCache`  | `boolean`                                  | `false`                    | 本次直接请求，不写入或删除已有缓存               |
| `onError`      | `(error: unknown) => void`，可返回 Promise | 客户端回调                 | 替代本次调用的客户端级观察器，不吞掉原错误       |

## 端点与校验

### defineEndpoint

| API                       | 导入入口                          | 参数                                      | 返回值               |
| ------------------------- | --------------------------------- | ----------------------------------------- | -------------------- |
| `defineEndpoint(options)` | `requestlane`、`requestlane/core` | `EndpointOptions<S>` 或 schema 推断的重载 | `Endpoint<S, Input>` |

| 重载形式                     | 输入类型来源                                       | 响应类型来源                             |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------- |
| 带 `inputValidators`         | schema 接受的原始输入；允许 undefined 的字段可省略 | `validator` 的输出；未提供时为 `unknown` |
| 仅带 `validator`             | 无必填输入字段                                     | `validator` 的输出                       |
| `defineEndpoint<S>(options)` | 显式 `EndpointSpec`                                | `S` 中的 `data`；未声明时为 `unknown`    |

### EndpointOptions

| 参数              | 类型                                | 必填 | 默认值         | 说明                                                            |
| ----------------- | ----------------------------------- | ---- | -------------- | --------------------------------------------------------------- |
| `method`          | `Method`                            | 是   | 无             | 声明 body 的端点类型排除 GET 和 HEAD                            |
| `path`            | `string`                            | 是   | 无             | 不能为空；可含路径占位符                                        |
| `id`              | `string`                            | 否   | 无             | 可选描述标识；不会替代自动生成的缓存身份                        |
| `inputValidators` | 含 `body/query/params` 的校验器对象 | 否   | 无             | 发送前校验与转换输入                                            |
| `validator`       | `Validator<EndpointData<S>>`        | 否   | 无             | codec 解包后的业务数据校验                                      |
| `codec`           | `ResponseCodec`                     | 否   | 客户端 codec   | 端点级响应协议                                                  |
| `querySerializer` | `(query: Query) => string`          | 否   | 内置序列化     | Query 为 spec 的 query 类型，未声明时为 unknown；接收转换后的值 |
| `cache`           | `boolean` 或 `CachePolicy`          | 否   | 关闭           | 仅 GET 可开启，见 [CachePolicy](./cache.md#配置与默认值)        |
| `timeout`         | `number`                            | 否   | 客户端 timeout | 端点默认调用超时                                                |
| `anonymous`       | `boolean`                           | 否   | `false`        | 端点默认匿名选项                                                |
| `responseType`    | `ResponseType`                      | 否   | `"json"`       | 端点默认响应格式                                                |

### Endpoint 与相关类型

| 字段或类型          | 定义                                   | 说明                                                 |
| ------------------- | -------------------------------------- | ---------------------------------------------------- |
| `endpoint.identity` | `readonly number`                      | 每次定义生成新值，参与缓存隔离；端点应定义一次并复用 |
| `endpoint.options`  | `Readonly<EndpointOptions<S>>`         | 冻结的顶层配置副本，不递归冻结嵌套对象               |
| `EndpointSpec`      | 可含 `body`、`query`、`params`、`data` | 描述输入及输出类型                                   |
| `EndpointInput<S>`  | 按 spec 生成输入对象类型               | 保留已声明字段的必填/可选约束；未声明字段不可传值    |
| `EndpointData<S>`   | spec 的 `data`，否则为 `unknown`       | 解包并校验后的响应类型                               |
| `ReadonlyData<T>`   | 递归只读类型视图                       | 不表示运行时深冻结                                   |

端点本身及 options 顶层被冻结。输入转换、异步 schema 和自定义校验器的用法见[类型与校验](../guides/validation.md)；校验器接口见 [Response](./response.md#validator)。

## 文件与响应格式

| responseType    | 响应数据      | 默认值 |
| --------------- | ------------- | ------ |
| `"json"`        | JSON 解析结果 | 是     |
| `"text"`        | `string`      | 否     |
| `"blob"`        | `Blob`        | 否     |
| `"arraybuffer"` | `ArrayBuffer` | 否     |

| 请求体类型                       | 序列化行为                                     |
| -------------------------------- | ---------------------------------------------- |
| 普通 JSON 值                     | JSON 序列化，默认 `application/json`           |
| `FormData`                       | 直接传输，由平台处理 multipart boundary        |
| `URLSearchParams`                | 表单编码字符串                                 |
| `string`                         | 文本，默认 `text/plain;charset=UTF-8`          |
| `Blob`                           | 使用其 type，缺省为 `application/octet-stream` |
| `ArrayBuffer`、TypedArray 等视图 | 二进制，默认 `application/octet-stream`        |
| `ReadableStream`                 | 当前请求入口不支持，抛 TypeError               |

## 传输 API

| API                              | 导入入口            | 参数                         | 返回值                                  |
| -------------------------------- | ------------------- | ---------------------------- | --------------------------------------- |
| `createFetchTransport(options?)` | `requestlane/fetch` | `FetchTransportOptions = {}` | `Transport & { native: Fetcher }`       |
| `createAxiosTransport(options?)` | `requestlane/axios` | `AxiosTransportOptions = {}` | `Transport & { native: AxiosInstance }` |

| 配置              | 类型                  | 默认值                                     | 说明                                        |
| ----------------- | --------------------- | ------------------------------------------ | ------------------------------------------- |
| Fetch `fetcher`   | `Fetcher`             | `globalThis.fetch`                         | 无可用实现时抛 TypeError                    |
| Axios `instance`  | `AxiosInstance`       | 按 config 创建实例                         | 已有 Axios 实例                             |
| Axios `config`    | `CreateAxiosDefaults` | 无                                         | 未传 instance 时用于创建实例                |
| Axios `cacheSafe` | `boolean`             | 没有 instance/config 时为 true，否则 false | 声明底层配置不在 key 之外改变请求身份或表示 |

| 类型或成员                  | 签名或字段                                                                                                                        | 说明                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `Fetcher`                   | `(input: RequestInfo \| URL, init?: RequestInit) => Promise<Response>`                                                            | Fetch 兼容函数                     |
| `Transport.send`            | `(request: TransportRequest) => Promise<TransportResponse>`                                                                       | 接收标准请求，返回标准响应         |
| `Transport.cacheSafe`       | `readonly cacheSafe?: boolean`                                                                                                    | false 时绕过 HTTP 缓存             |
| `TransportRequest` 必填字段 | `url: string`、`method: Method`、`headers: Readonly<Record<string, string>>`、`signal: AbortSignal`、`responseType: ResponseType` | 由客户端准备后的传输参数           |
| `TransportRequest` 可选字段 | `body?: BodyInit`、`credentials?: RequestCredentials`                                                                             | 已序列化的请求体及凭证模式         |
| `native`                    | Fetcher 或 AxiosInstance                                                                                                          | 直接调用会绕过端点、会话和缓存管线 |

Fetch transport 固定使用 `cache: "no-store"`。Axios 原生 timeout 设为 0，由客户端预算统一管理；`credentials: "omit"` 会被拒绝。配置覆盖与框架行为见[与已有工具配合](../guides/integrations.md)。

## 超时与取消

以下工具从 `requestlane` 或 `requestlane/core` 导入。

| API                                          | 参数与默认值                                                                          | 返回值或行为                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `isRequestCancelled(error)`                  | `error: unknown`                                                                      | `boolean`，识别取消错误                                              |
| `checkTimeout(timeout)`                      | `timeout: number`，必填                                                               | `void`；非有限数或负数抛 TypeError                                   |
| `requestLifetime(options?, defaultTimeout?)` | `options: { signal?: AbortSignal; timeout?: number } = {}`；`defaultTimeout = 15_000` | 返回含 signal、timedOut、dispose 的对象                              |
| `raceSignal<T>(pending, signal)`             | `pending: Promise<T>`；`signal: AbortSignal`，均必填                                  | `Promise<T>`；取消时结束等待，仍观察原 Promise；不会自行中断底层工作 |

| requestLifetime 返回成员 | 类型           | 说明                                 |
| ------------------------ | -------------- | ------------------------------------ |
| `signal`                 | `AbortSignal`  | 由外部取消或超时触发的组合信号       |
| `timedOut`               | 只读 `boolean` | 是否由该预算超时触发                 |
| `dispose()`              | `void`         | 清理计时器和监听器，不等同于取消请求 |

调用预算覆盖校验、刷新等待和传输。共享缓存请求的传输取消规则见 [Cache](./cache.md#会话与取消)。

## 实例复用与释放

| 成员               | 类型或签名                               | 行为                                               |
| ------------------ | ---------------------------------------- | -------------------------------------------------- |
| `CoreClient.cache` | `CacheStore` 或 `undefined`，只读 getter | 未配置缓存时为 undefined                           |
| `Client.cache`     | `ReadCache`，只读 getter                 | 完整客户端持有的内存缓存                           |
| `dispose()`        | `void`                                   | 清空实例缓存、取消在途调用；后续请求以取消错误拒绝 |

共享实例由创建者统一释放。跨模块复用代码见[快速开始](../guides/usage.md#复用客户端)。`setToken/clearToken` 见 [Session](./session.md#设置-token)；`invalidate/withInvalidation` 见 [Cache](./cache.md#失效与绕过)。

## 错误行为

| 条件                                                                          | 结果                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| timeout 非有限非负数、路径参数缺失、GET/HEAD 带 body、不支持的默认 query 结构 | TypeError                                        |
| 端点 path 为空、非 GET 端点开启 cache                                         | 定义端点时抛 TypeError                           |
| core 未配置缓存却调用缓存端点，且未 bypass                                    | 发送前抛 TypeError                               |
| core 未配置会话却操作 token 或提供非匿名 sessionToken                         | TypeError                                        |
| HTTP、协议、校验、业务、网络或取消失败                                        | 详见 [Response 错误处理](./response.md#错误处理) |
