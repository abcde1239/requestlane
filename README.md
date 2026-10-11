# frontcache 0.1.0

框架无关的 TypeScript 前端通信包。核心、原生 Fetch 和 Axios 分开导出；默认使用普通 JSON，不依赖 Vue、sends 模型或特定业务响应协议。

初版支持自定义端点类型、同步/异步校验器、可配置响应 codec、可选会话、请求超时/取消，以及显式开启的实例内内存缓存。持久化存储不在默认行为中；不自动重试写请求。

## 安装与入口

初版提供本地安装包，尚未发布到 npm：

```bash
npm install ./frontcache-0.1.0.tgz
# 只有使用 Axios 或 sends 兼容入口时才需要
npm install axios
```

| 入口 | 内容 |
| --- | --- |
| `frontcache` | Client、端点定义、通用类型、codec、错误和 BaseService |
| `frontcache/fetch` | createFetchTransport；无需 Axios |
| `frontcache/axios` | createAxiosTransport；Axios 是可选 peer dependency |
| `frontcache/cache` | ReadCache 原语 |
| `frontcache/response/sends` | 可选 sends envelope 与响应助手；无需 Axios |
| `frontcache/compat/sends` | 旧 HttpRequest、SessionHttpRequest、BaseService 和助手；依赖 Axios |

运行目标为 Node 20+、支持 Fetch/AbortController 的现代浏览器；产物是 ESM 和 `.d.ts`，TypeScript 最低版本 5.0，已验证最新稳定版 7.0.2（2026-10-11 npm latest）。Bun 仅用于仓库开发和测试，产物不依赖 Bun API。

## 简单请求

```ts
import { createClient } from 'frontcache'
import { createFetchTransport } from 'frontcache/fetch'

interface Member { id: string; name: string }
const client = createClient({
  baseURL: '/api',
  transport: createFetchTransport(),
  timeout: 15_000
})

const member = await client.get<Member>('/members/1')
await client.patch<Member, { name: string }>('/members/1', { name: 'New name' })
```

`get/post/put/patch/delete` 返回解包后的数据。统一泛型顺序为响应数据、body、query、path；快捷方法省去不适用的参数。body 不额外包一层 `{ data: ... }`。未声明响应类型时返回 unknown；手写泛型是静态声明，不等于验证了服务器数据。

`requestRaw` 返回中立的 `{ status, statusText, headers, url, data }`，不解释业务；`requestEnvelope` 解析并保留 envelope；`requestData` 解析、解包。共同请求接受 2xx，其他状态抛 HttpError。支持 json、text、blob、arraybuffer；HEAD/204 的 raw data 为 undefined。

## 强类型端点与内存缓存

```ts
import { defineEndpoint } from 'frontcache'

const memberDetail = defineEndpoint<{
  params: { id: string }
  query: { detailed?: boolean }
  data: Member
}>({
  method: 'GET',
  path: '/members/:id',
  cache: { ttl: 30_000, tags: ['members'] }
})

const member = await client.call(memberDetail, {
  params: { id: '1' },
  query: { detailed: true }
})

await client.withInvalidation(['members'], () =>
  client.patch('/members/1', { name: 'Updated' })
)
client.invalidate({ endpoint: memberDetail })
client.invalidate({ tag: 'members' })
client.invalidate() // 全部
client.dispose() // 取消在途请求并释放缓存
```

端点将 method、path、query、body 和响应绑定；不能在调用时任意改响应泛型。缺必填字段、错误枚举、GET body、多余字面量字段会被严格 TypeScript 检查。`call` 统一返回递归只读类型视图，避免共享缓存被误改；不进行运行时冻结，编辑前复制数据。配置对象视为不可变，修改 codec/validator/策略时定义新端点。

客户端默认不缓存响应；GET 端点用 `cache: true` 或策略对象启用。默认 TTL=30 秒、容量=20、FIFO；容量可在 `createClient({ cache: { capacity: 100 } })` 设置。TTL 从成功解析与校验完成开始；TTL=0 仅合并在途，不保留完成值。TTL 必须有限非负，容量必须为正整数。

同键并发共享请求，每个消费者独立取消，最后一个消费者退出才终止传输。失败不缓存；失效同时取消匹配的在途读取，迟到数据不回填。key 含端点实例、最终参数、身份、headers、credentials、响应方式和超时策略，不含认证 token。不同端点定义即使 id 相同也隔离。

可配置 `cache.key(input)` 自定义业务 alias，再通过 `invalidate({ key: alias })` 失效。它不绕过参数、身份或端点隔离。单次 `{ bypassCache: true }` 不读、不合并、不写缓存，旧值仍在；需要更新先 invalidate。`withInvalidation(tags, thunk)` 在创建写请求前及 finally 均失效。

缓存默认存储在内存，不访问 localStorage、sessionStorage、IndexedDB 或文件。认证/refresh/STS 等凭证端点和要求实时的查询不要启用缓存；raw/native 入口和写端点不进入响应缓存。实例容量限制可复用条目，不是整个应用的总内存/并发限制。

## 接入运行时校验器

```ts
const count = defineEndpoint({
  method: 'GET',
  path: '/count',
  validator: {
    parse(value: unknown) {
      if (typeof value !== 'number') throw new Error('Expected a number')
      return value
    }
  }
})
const value = await client.call(count, {}) // number，来自 parse 返回类型
```

校验器可以是自己的对象，或具有 `parse` 方法的 schema。支持异步 parse；不强制依赖任何 schema 库。`inputValidators.body/query/params` 在发送前验证和转换输入；`validator` 在 codec 解包后验证响应。失败抛 ValidationError 并保留 cause，不发送错误输入，不缓存错误响应。

使用 Zod 时由应用自行安装 `zod`，同步 schema 可以直接传入；推断使用转换后的输出类型：

```ts
import { z } from 'zod'

const memberSchema = z.object({
  id: z.string(),
  age: z.string().transform(value => Number(value))
})
const memberEndpoint = defineEndpoint({
  method: 'GET', path: '/me', validator: memberSchema, cache: true
})
const member = await client.call(memberEndpoint, {}) // readonly { id: string; age: number }

// 包含异步 refinement/transform 时，用 parseAsync 桥接
const asyncEndpoint = defineEndpoint({
  method: 'GET', path: '/me',
  validator: { parse: (value: unknown) => memberSchema.parseAsync(value) }
})
```

带 body/query/params 的端点可显式声明 `data: z.output<typeof memberSchema>`，输入 schema 放入 `inputValidators`；需要校验转换时，声明应与转换后的值相容。ZodError 保存在 ValidationError.cause。已实测 Zod 4.6.5；应用选择的校验库仍受其自身 TypeScript 版本要求约束，核心的 TS 5.0 支持不改变这些要求。

## 自定义响应协议

```ts
import { createCodec, BusinessError } from 'frontcache'

const codec = createCodec<{ success: boolean; result: unknown }>({
  parse(value) {
    if (!value || typeof value !== 'object' || !('success' in value)) {
      throw new Error('Invalid envelope')
    }
    return value as { success: boolean; result: unknown }
  },
  unwrap(envelope) {
    if (!envelope.success) throw new BusinessError(envelope, 'Rejected')
    return envelope.result
  }
})
const client = createClient({ transport: createFetchTransport(), codec })
```

也可使用 `frontcache/response/sends` 的 `sendsCodec` 或 `createSendsCodec(errorDefinitions)`。它支持数字 code 优先：0 成功、>=1000 失败；无 code 时以 msg==='ok' 判断。成功 data 可为 null/false/0/空值，但必须存在且非 undefined。业务码与真实 HTTP 状态分开保存，映射状态仅为 suggestedStatus。

## Axios 与原生旁路

```ts
import axios from 'axios'
import { createAxiosTransport } from 'frontcache/axios'

const transport = createAxiosTransport({ instance: axios.create() })
const client = createClient({ transport, baseURL: '/api' })
const nativeResponse = await transport.native.get('/export', { responseType: 'blob' })
```

注入实例时不修改其 defaults/interceptors。原生拦截器无法被核心观察，默认绕过响应缓存；宿主确认请求/身份变化稳定后可明确设置 `cacheSafe: true`。共享 URL/query 序列化使用核心规则，原生 paramsSerializer/transform/progress 等通过 `transport.native` 使用。

Fetch transport 同样提供 `native(input, init)`。native 旁路保留原生库行为，不自动经过本包会话、校验或缓存；Fetch Response 的 body 仅可消费一次。credentials 默认 same-origin，include 在 Axios 中映射 withCredentials；Axios 公共 omit 显式拒绝，因为它不能保证取消同源 Cookie。

## 可选会话与认证

```ts
const client = createClient({
  transport: createFetchTransport(),
  session: {
    token: () => auth.token,
    sessionVersion: () => auth.identityVersion,
    ensureFreshToken: () => auth.ensureFreshToken(),
    onUnauthorized: () => auth.logout(),
    requireToken: true
  }
})
await client.post('/login', credentials, { anonymous: true })
await client.post('/refresh', undefined, { sessionToken: auth.token })
```

auth 是宿主会话对象。刷新合并、JWT、存储、退避与路由都由宿主负责。会话优先级为 anonymous → sessionToken → provider → manual；provider 返回空值不恢复旧 manual。`setToken/clearToken` 只在没有 provider 时成为权威凭证，普通模式保留显式单次 Authorization 优先。

认证缓存必须提供稳定 `sessionVersion`，身份/权限切换时改变，普通 token 续期时保持；退出同时 invalidate/dispose。旧会话响应不回填，旧 401 不登出新账号，403/503/网络故障不清会话。匿名跳过 token/refresh，但不能承诺撤销浏览器自动携带的 Cookie。

支持不同认证格式，例如 API key：

```ts
const client = createClient({
  transport: createFetchTransport(),
  auth: { header: 'X-Api-Key', format: token => token }
})
client.setToken('your-key')
```

默认 timeout=15 秒，0 关闭，覆盖输入校验、刷新等待、网络、body 读取与输出校验。共享读取的消费者独立超时；`cache.transportTimeout` 设置共享传输预算。异步操作忽略 abort 时，消费者仍及时结束且忽略迟到结果。

## 错误与旧接口

`classifyError(error)` 区分 business/http/network/timeout/cancelled/protocol/validation/unknown；真实错误保留 cause。retryable 是信息，不触发重试。`onError` 可异步，其失败不覆盖原错误。包不输出请求配置、不弹提示、不导航。

`frontcache/compat/sends` 保留旧 `<Body, Data>` post/patch 泛型、AxiosResponse、Axios 原始错误、legacy/session BaseService 构造和响应助手。legacy BaseService 默认 3 秒；SessionHttpRequest.raw 继续校验 envelope，与新核心 raw 不同。checkOk 成功 true，业务失败拒绝；来源旧文档/一个测试要求 false，本包已明确采用拒绝行为。来源项目及其旧测试未修改。

AuthService、FileService、社区路由与 DTO 留在业务应用；仓库 `examples/` 演示 service 组合、认证和可注入上传器。

## 开发与验证

```bash
bun install --frozen-lockfile
bun run verify
# 或 bash scripts/verify.sh
bun run build
bun run pack:local
```

安装开发依赖时，`prepare` 会自动配置 Husky。每次 `git commit` 都检查暂存区快照，运行严格类型检查、全部行为测试与 ESM/声明构建，失败即阻止提交。未暂存的修复不能使待提交的错误代码通过；本地依赖需先通过 `bun install --frozen-lockfile` 安装。也可用 `bun run test:commit` 手动检查当前暂存区。

提交钩子不要求本机安装浏览器；完整打包、最低/最新 TS 消费矩阵与浏览器集成由 `bun run verify` 执行。`docs/`、`verification/`、`verficaction/`、`.agent/` 为本地文件，已加入忽略规则；即使强制暂存，提交钩子也会拒绝。

verify 执行严格类型与反例 fixture、离线测试、ESM/声明构建、本地打包、Fetch-only/Axios 隔离消费、TypeScript 5.0.4/7.0.2 在 NodeNext/Bundler 两种解析模式下的声明检查，以及最新 TS 的 Zod 消费检查。源码和消费工程均使用 `skipLibCheck: false`。还会运行 Node 本地 HTTP 与真实 Chromium 通信测试；浏览器会自动探测 Chrome/Edge，其他环境设置 `CHROMIUM_PATH`。打包结果位于 `artifacts/frontcache-0.1.0.tgz`。不发布 npm，不修改来源业务仓库。
