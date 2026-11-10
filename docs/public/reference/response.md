# Response API

[文档首页](../index.md) · [Client API](./client.md) · [类型与校验](../guides/validation.md)

| 导入入口                          | API                                                   |
| --------------------------------- | ----------------------------------------------------- |
| `requestlane`、`requestlane/core` | codec、Validator、TransportResponse、错误类与分类工具 |
| `requestlane/response/sends`      | Sends 协议、响应类型及 Promise 助手                   |

不存在 `requestlane/response` 导出入口。默认 identityCodec 原样返回响应体，不假定服务器采用 StandardResponse。

## 选择返回层次

| 客户端方法                           | 返回值                          | 处理阶段                           | 非 2xx       |
| ------------------------------------ | ------------------------------- | ---------------------------------- | ------------ |
| `requestRaw<D>(config)`              | `Promise<TransportResponse<D>>` | 传输响应解析，不经过 codec         | 抛 HTTP 错误 |
| `head(url, options?)`                | `Promise<TransportResponse>`    | 同上，响应 data 为 undefined       | 抛 HTTP 错误 |
| `requestEnvelope<E>(config, codec?)` | `Promise<E>`                    | codec.parse，保留解析后的 envelope | 抛 HTTP 错误 |
| `requestData<D>(config, codec?)`     | `Promise<D>`                    | parse → unwrap                     | 抛 HTTP 错误 |
| `get/post/put/patch/delete`          | `Promise<D>`                    | 同 requestData                     | 抛 HTTP 错误 |
| `call(endpoint, input?, options?)`   | 端点数据的只读类型 Promise      | parse → unwrap → validator         | 抛 HTTP 错误 |

requestEnvelope 不执行 unwrap，业务成功状态由调用者判断。默认 identityCodec 的 parse/unwrap 均原样返回值，因此默认 requestEnvelope 与 requestData 返回相同层次的数据。泛型不会在运行时检查服务器响应。

### TransportResponse<T = unknown>

| 字段         | 类型                               | 必填 | 说明                                           |
| ------------ | ---------------------------------- | ---- | ---------------------------------------------- |
| `status`     | `number`                           | 是   | 真实 HTTP 状态码                               |
| `statusText` | `string`                           | 是   | 状态描述                                       |
| `headers`    | `Readonly<Record<string, string>>` | 是   | 标准化后的响应头                               |
| `url`        | `string`                           | 是   | transport 提供的响应 URL                       |
| `data`       | `T`                                | 是   | 已按 responseType 解析的响应体，不是原始字节流 |

## ResponseCodec

`ResponseCodec<Envelope = unknown>` 从 `requestlane` 或 `requestlane/core` 导入。

| 方法               | 参数                 | 返回值                          | 职责                         |
| ------------------ | -------------------- | ------------------------------- | ---------------------------- |
| `parse(value)`     | `value: unknown`     | Envelope 或 `Promise<Envelope>` | 解析并检查协议外层           |
| `unwrap(envelope)` | `envelope: Envelope` | unknown 或 `Promise<unknown>`   | 提取业务数据，或抛出业务错误 |

| API                             | 参数                                                                     | 默认值           | 返回值或行为                                                                            |
| ------------------------------- | ------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------- |
| `createCodec<Envelope>(codec)`  | `ResponseCodec<Envelope>`，必填                                          | 无               | 返回传入的 codec，不在创建时校验服务器响应                                              |
| `identityCodec`                 | 常量，类型 ResponseCodec                                                 | 客户端默认 codec | parse/unwrap 均原样返回值                                                               |
| `parseEnvelope(codec, value)`   | `codec: ResponseCodec`；`value: unknown`，均必填                         | 无               | `Promise<unknown>`；执行 parse，非 CommunicationError 的异常包装为 InvalidResponseError |
| `validate<T>(validator, value)` | `validator: Validator<T>` 或 undefined；`value: unknown`，两个参数均必传 | 无               | `Promise<unknown>`；无校验器则原样返回，否则校验失败包装为 ValidationError              |

### codec 配置优先级

| 调用方式                    | codec 来源                                |
| --------------------------- | ----------------------------------------- |
| requestData/requestEnvelope | 第二个参数 → 客户端 codec → identityCodec |
| call                        | 端点 codec → 客户端 codec → identityCodec |
| get/post/put/patch/delete   | 客户端 codec → identityCodec              |
| requestRaw/head             | 跳过 codec                                |

## Validator

`Validator<T, Input = unknown>` 从 `requestlane` 或 `requestlane/core` 导入。

| 成员         | 类型                                    | 必填 | 说明                                                |
| ------------ | --------------------------------------- | ---- | --------------------------------------------------- |
| `parse`      | `(value: unknown) => T`，可返回 Promise | 是   | 运行时检查并返回解析结果                            |
| `parseAsync` | `(value: unknown) => Promise<T>`        | 否   | 存在时优先于 parse 使用                             |
| `_input`     | `readonly _input?: Input`               | 否   | 仅供编译期推断原始输入类型；Zod schema 自带类型标记 |

输入校验器用于发送前的 body/query/params，响应 validator 用于 unwrap 之后的业务字段。Validator 的运行时异常通过 validate 包装为 ValidationError，原异常保留在 cause 中。

## Sends 协议

### API 与响应类型

以下 API 从 `requestlane/response/sends` 导入。

| API                              | 参数                                           | 默认值         | 返回值                                                    |
| -------------------------------- | ---------------------------------------------- | -------------- | --------------------------------------------------------- |
| `createSendsCodec(definitions?)` | `Readonly<Record<number, BusinessDefinition>>` | `{}`           | `ResponseCodec<StandardResponse<unknown>>`                |
| `sendsCodec`                     | 常量                                           | 无业务代码映射 | 同 createSendsCodec() 的默认协议                          |
| `parseResponse<T>(value)`        | `value: unknown`，必填；T 默认为 unknown       | 无             | `StandardResponse<T>`；只校验外层，不检查 data 业务字段   |
| `isSuccess<T>(response)`         | `StandardResponse<T>`，必填                    | 无             | 类型谓词 `response is SuccessResponse<T>`；自身不解析结构 |
| `unwrapResponse<T>(value)`       | `value: unknown`，必填；T 默认为 unknown       | 无             | `T`；解析并提取 data，失败抛错                            |

| 类型                  | 字段                                    | 必填 | 含义                                       |
| --------------------- | --------------------------------------- | ---- | ------------------------------------------ |
| `SuccessResponse<T>`  | `code?: 0`                              | 否   | 成功代码                                   |
| 同上                  | `msg: string`                           | 是   | 消息文本                                   |
| 同上                  | `data: T`                               | 是   | 业务数据                                   |
| `ErrorResponse`       | `code?: number`                         | 否   | 错误代码                                   |
| 同上                  | `msg: string`                           | 是   | 失败消息                                   |
| 同上                  | `data?: unknown`                        | 否   | 附加数据                                   |
| `StandardResponse<T>` | SuccessResponse 与 ErrorResponse 的联合 | —    | 仅描述本协议，泛型不是业务字段的运行时验证 |

### parse 与 unwrap 规则

| 条件                                               | 结果                                              |
| -------------------------------------------------- | ------------------------------------------------- |
| 响应不是非空对象，或为数组                         | InvalidResponseError                              |
| msg 不是非空白字符串                               | InvalidResponseError                              |
| 提供 code 但不是安全整数，或既不等于 0 又小于 1000 | InvalidResponseError                              |
| code 为 0，或未提供 code 且 msg 为 "ok"            | 判定业务成功；必须有非 undefined 的自有 data 字段 |
| 成功响应缺少 data                                  | InvalidResponseError                              |
| parse 合法，但不满足业务成功条件                   | parse 返回 envelope；unwrap 抛 BusinessError      |
| unwrap 成功                                        | 返回 data；不验证其中的业务字段                   |

### BusinessDefinition

用于 createSendsCodec 的业务代码映射。

| 参数      | 类型     | 默认值                      | 说明                                                                    |
| --------- | -------- | --------------------------- | ----------------------------------------------------------------------- |
| `message` | `string` | `"Business request failed"` | 仅在业务失败但服务器 msg 为 "ok" 时作为替代消息；其他情况使用服务器 msg |
| `status`  | `number` | 无                          | 写入错误 suggestedStatus，不替换真实 HTTP status                        |

## Sends Promise 助手

| API                                              | 参数                                                                    | 返回值                            | 失败行为                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------- | ------------------------------------------- |
| `wrapRequest<T>(request, callback?, onError?)`   | request 为 `Promise<StandardResponse<T>>`；该重载 callback 为 undefined | `Promise<T>`                      | 观察错误后仍拒绝                            |
| `wrapRequest<T, R>(request, callback, onError?)` | callback 为 `(response: SuccessResponse<T>) => R`，可返回 Promise       | `Promise<R>`                      | 业务失败、输入 Promise 拒绝、回调失败均拒绝 |
| `getData<T>(request, onError?)`                  | `Promise<StandardResponse<T>>`；可选 ErrorHandler                       | `Promise<T>`                      | 观察错误后仍拒绝                            |
| `checkOk<T>(request, onError?)`                  | 同上                                                                    | `Promise<boolean>`，成功值为 true | 失败时拒绝，不返回 false                    |
| `ErrorHandler`                                   | `(error: unknown) => void`，可返回 Promise                              | 类型导出                          | 观察器错误不替换原错误                      |

这些助手处理已有 Promise，不发送请求，也不校验 data 的业务字段。已被 requestData/get 解包的数据不再是该协议的 envelope。

## 错误处理

### 错误工具

以下工具从 `requestlane` 或 `requestlane/core` 导入。

| API                         | 参数              | 返回值               | 行为                                                                              |
| --------------------------- | ----------------- | -------------------- | --------------------------------------------------------------------------------- |
| `classifyError(error)`      | `unknown`         | `ErrorInfo`          | 分类 CommunicationError，以及可识别的 Axios/取消/超时错误；其他外部错误归 unknown |
| `errorMessage(error)`       | `unknown`         | `string`             | 返回错误文本；cancelled 返回空字符串                                              |
| `isRequestCancelled(error)` | `unknown`         | `boolean`            | 识别 AbortError、cancelled 类型和 ERR_CANCELED                                    |
| `normalizeError(error)`     | `unknown`         | `CommunicationError` | 保留既有 CommunicationError，其他错误按取消、超时、HTTP 或网络归一化              |
| `cancelled(cause?)`         | `unknown`，可省略 | `CommunicationError` | 创建 kind 为 cancelled、name 为 AbortError 的错误                                 |

### 错误类

| 构造器                                           | 参数与默认值                                                                                            | kind       | 特有成员                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `CommunicationError(message, kind, details?)`    | message: string；kind: ErrorKind；details: ErrorDetails = {}                                            | 由参数指定 | 通信错误基类                                                                |
| `HttpError(response, cause?)`                    | response: TransportResponse；cause?: unknown                                                            | http       | response 保存传输响应，status 为实际状态；可从响应体 code 提取 businessCode |
| `InvalidResponseError(message?, cause?)`         | message = "Invalid response format"；cause?: unknown                                                    | protocol   | 协议或响应解析失败                                                          |
| `ValidationError(cause)`                         | cause: unknown，必填                                                                                    | validation | cause 保存原始校验异常                                                      |
| `BusinessError<E>(envelope, message?, details?)` | E 默认为 unknown；message = "Business request failed"；details 为排除 response 的 ErrorDetails，默认 {} | business   | readonly envelope；code getter 等于 businessCode                            |

### ErrorDetails 与错误属性

| 字段              | 类型                 | 必填 | 含义                                               |
| ----------------- | -------------------- | ---- | -------------------------------------------------- |
| `cause`           | `unknown`            | 否   | 原始错误，保留为 Error.cause                       |
| `status`          | `number`             | 否   | 真实 HTTP 状态                                     |
| `businessCode`    | `number` 或 `string` | 否   | 业务代码                                           |
| `suggestedStatus` | `number`             | 否   | 协议映射建议值                                     |
| `response`        | `TransportResponse`  | 否   | 可用的传输响应；BusinessError 构造选项不接受此字段 |

CommunicationError 另有只读 kind 和继承自 Error 的 name、message。上述字段在错误实例中按只读属性提供，cause 继承自 Error。

### ErrorKind

| 值           | 含义                                      |
| ------------ | ----------------------------------------- |
| `http`       | HTTP 失败，或 requireToken 的本地认证拒绝 |
| `network`    | 网络请求失败                              |
| `timeout`    | 调用超时                                  |
| `cancelled`  | 调用取消或所属身份失效                    |
| `protocol`   | 响应解析或协议格式错误                    |
| `validation` | 输入或业务响应字段校验失败                |
| `business`   | codec 解包时判定业务失败                  |
| `unknown`    | 无法分类的外部错误                        |

### ErrorInfo

| 字段              | 类型                 | 必填 | 说明                                                                   |
| ----------------- | -------------------- | ---- | ---------------------------------------------------------------------- |
| `kind`            | `ErrorKind`          | 是   | 分类结果                                                               |
| `message`         | `string`             | 是   | 展示文本                                                               |
| `status`          | `number`             | 否   | HTTP 状态                                                              |
| `businessCode`    | `number` 或 `string` | 否   | 业务代码                                                               |
| `suggestedStatus` | `number`             | 否   | 建议状态                                                               |
| `retryable`       | `boolean`            | 是   | network、timeout、status 429 或 status ≥ 500 时为 true，仅提供判断信息 |

本包不会因 retryable 自动重试。TypeError 可用于配置错误，不属于 CommunicationError；未经归一化的普通 TypeError 经 classifyError 分类为 unknown。
