# Session API

[文档首页](../index.md) · [Client API](./client.md) · [Cache API](./cache.md)

## 为 Core 添加会话

| API                       | 导入入口                                                 | 参数                     | 返回值           |
| ------------------------- | -------------------------------------------------------- | ------------------------ | ---------------- |
| `createSession(options?)` | `requestlane/session`                                    | `SessionOptions`，可省略 | `SessionFactory` |
| `SessionOptions`          | `requestlane/session`、`requestlane`、`requestlane/core` | 会话选项类型             | 类型导出         |
| `SessionFactory`          | `requestlane/core`                                       | 工厂类型                 | 类型导出         |

| 客户端入口         | session 参数                               | 默认行为         |
| ------------------ | ------------------------------------------ | ---------------- |
| `requestlane`      | `SessionOptions` 普通对象                  | 自动创建会话能力 |
| `requestlane/core` | `createSession(...)` 返回的 SessionFactory | 不传则无会话能力 |

工厂由客户端调用，每个客户端独立保存手动 token 和已观察的身份版本。多个客户端可以读取同一个外部 provider，但不共享内部手动凭证。

## SessionOptions

| 参数               | 类型                         | 必填 | 默认值                  | 说明                                                                        |
| ------------------ | ---------------------------- | ---- | ----------------------- | --------------------------------------------------------------------------- |
| `token`            | `() => string`               | 否   | 手动 token，初始为 `""` | 同步读取外部凭证；配置后优先于 setToken                                     |
| `ensureFreshToken` | `() => Promise<string>`      | 否   | 无                      | 非匿名且无单次 sessionToken 时调用；返回本次使用的最新 token                |
| `sessionVersion`   | `() => Scope`                | 否   | 无                      | 同步读取身份或权限代次；Scope 为 string 或 number                           |
| `onUnauthorized`   | `() => void`，可返回 Promise | 否   | 无                      | 处理当前有效认证请求的 HTTP 401                                             |
| `requireToken`     | `boolean`                    | 否   | `false`                 | 非匿名请求缺少所选 token 时，发送前以 status 401 的 CommunicationError 拒绝 |

token 存储、登录和刷新请求由应用提供。ensureFreshToken 若与 token provider 同时配置，返回前应同步 provider 对应的状态；本包不自动合并多个刷新调用。

## 设置 token

以下方法由 `Client` 和 `CoreClient` 提供；core 需要先配置会话能力。

| 方法              | 参数                  | 返回值 | 行为                                                                           |
| ----------------- | --------------------- | ------ | ------------------------------------------------------------------------------ |
| `setToken(token)` | `token: string`，必填 | `void` | 设置实例内手动凭证；未配置 token provider 时，凭证变化会推进身份并清理实例缓存 |
| `clearToken()`    | 无                    | `void` | 等同 setToken("")；不清理外部 token provider                                   |

### 单次请求选项

| 参数           | 类型      | 默认值                | 行为                                                                          |
| -------------- | --------- | --------------------- | ----------------------------------------------------------------------------- |
| `anonymous`    | `boolean` | `false`，可由端点设置 | 忽略会话凭证和 sessionToken，不等待刷新；移除 Authorization 及配置的认证头    |
| `sessionToken` | `string`  | 无                    | 覆盖当前调用的凭证并跳过 ensureFreshToken；非匿名时需要会话能力，绕过响应缓存 |

| 条件                                    | 凭证来源                                                  |
| --------------------------------------- | --------------------------------------------------------- |
| anonymous 为 true                       | 无会话凭证                                                |
| 提供 sessionToken                       | 单次凭证                                                  |
| 无 sessionToken 且提供 ensureFreshToken | 刷新回调的结果；若配置 provider，返回值应与 provider 同步 |
| 未触发刷新且提供 token provider         | provider 返回值                                           |
| 其他情况                                | setToken 保存的手动值                                     |

## 动态会话

| 状态变化          | token      | sessionVersion |
| ----------------- | ---------- | -------------- |
| 登录、退出、换号  | 更新或清空 | 更新           |
| 权限变化          | 按需更新   | 更新           |
| 同身份 token 续期 | 更新       | 保持不变       |

| 条件                                        | 处理                                     |
| ------------------------------------------- | ---------------------------------------- |
| 请求开始时观察到身份版本变化                | 推进客户端身份代次并失效缓存             |
| 请求处理中身份版本变化                      | 旧身份调用被拒绝，结果不交给当前身份     |
| 配置 token provider 但无 sessionVersion     | 检查凭证变化；不能安全用于非匿名响应缓存 |
| token provider 或刷新回调参与非匿名端点缓存 | 必须提供 sessionVersion，否则 TypeError  |

## 刷新与未授权响应

| API 或事件                       | 触发条件                                          | 行为                                                       |
| -------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| `ensureFreshToken()`             | 非匿名请求，且没有 sessionToken                   | 每次符合条件的请求在发送前等待；是否需要实际刷新由宿主决定 |
| 刷新等待期间消费者取消           | 当前调用 signal 取消                              | 仅退出该调用等待，不中止其他调用的宿主刷新                 |
| `onUnauthorized()`               | 当前有效、携带非空所选凭证的认证请求返回 HTTP 401 | 调用宿主清理逻辑；其异常不替换原 HTTP 失败                 |
| 匿名响应、旧身份响应、403 或 503 | 不满足当前认证请求的 401 条件                     | 不触发当前会话的 onUnauthorized                            |

包不会自动重新登录或重放请求。已有认证模块的分工见[认证状态](../guides/integrations.md#认证状态)。

## 自定义认证格式

auth 位于客户端配置，不属于 SessionOptions。

| 参数或 API           | 类型                        | 默认值            | 说明                                                                   |
| -------------------- | --------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `auth.header`        | `string`                    | `"authorization"` | token 写入的请求头，名称按小写处理                                     |
| `auth.format`        | `(token: string) => string` | `bearerToken`     | 非空凭证的格式化函数                                                   |
| `bearerToken(token)` | `(token: string) => string` | 无                | 去除首尾空白及已有 Bearer 前缀，统一返回 Bearer 格式；空值返回空字符串 |

bearerToken 从 `requestlane` 或 `requestlane/core` 导入。

## 释放客户端

| 操作                                    | 影响                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `clearToken()`                          | 清除手动凭证，客户端可继续使用                         |
| 清理 provider 状态并更新 sessionVersion | 宿主退出或切换身份，后续按新身份处理                   |
| `client.dispose()`                      | 结束客户端生命周期，清缓存并取消在途请求；后续请求拒绝 |

会话工厂不提供独立的 dispose 方法，生命周期由所属客户端管理。

## 错误行为

| 条件                                         | 结果                                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| core 未配置会话却调用 setToken/clearToken    | TypeError                                                   |
| core 未配置会话却提供非匿名 sessionToken     | TypeError                                                   |
| requireToken 为 true 且没有所选 token        | CommunicationError，kind 为 http、status 为 401；不发送请求 |
| 刷新返回凭证与 provider 不一致，或身份已失效 | 取消错误                                                    |
| 动态认证缓存缺少 sessionVersion              | TypeError                                                   |

其他请求错误见 [Response](./response.md#错误处理)。
