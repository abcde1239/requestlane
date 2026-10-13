# requestlane 使用文档

[返回 README](./README.md)

## 安装与入口

```bash
npm install requestlane
```

Axios 和 Zod 是自动安装的运行依赖。包提供 ESM，适用于现代浏览器和 Node 20+；核心类型支持 TypeScript 5.0+，使用 Zod 时请满足该库的 TypeScript 版本要求。

| 入口                         | 用途                                        |
| ---------------------------- | ------------------------------------------- |
| `requestlane`                | Client、类型端点、codec、错误与 BaseService |
| `requestlane/fetch`          | 原生 Fetch 传输                             |
| `requestlane/axios`          | Axios 传输                                  |
| `requestlane/cache`          | 独立内存 ReadCache                          |
| `requestlane/response/sends` | 可选的 code/msg/data 响应协议助手           |

下文假设接口位于 `/api`；Node 环境应使用 `https://example.com/api` 等完整地址。请求路径、登录返回结构与业务字段需按实际接口调整。

## 创建客户端与发送请求

```ts
import { createClient } from "requestlane";
import { createFetchTransport } from "requestlane/fetch";

const client = createClient({
  baseURL: "/api",
  transport: createFetchTransport(),
  timeout: 15_000,
  cache: { ttl: 30_000, capacity: 20 },
});

interface Member {
  id: string;
  name: string;
}

const member = await client.get<Member>("/members/1");
await client.post<Member>("/members", { name: "Ada" });
await client.patch<Member>("/members/1", { name: "新名称" });
await client.delete("/members/1");
```

默认返回普通 JSON 数据，未声明类型的响应是 `unknown`。泛型是对接口的静态声明，不校验服务器返回值。`get/post/put/patch/delete` 返回数据；`head` 和 `requestRaw` 返回包含 `status`、`headers`、`data` 的传输响应。

```ts
const raw = await client.requestRaw<Member>({
  url: "/members/:id",
  params: { id: "1" },
  query: { detailed: true },
});
console.log(raw.status, raw.data);

const text = await client.get<string>("/notice", { responseType: "text" });
const blob = await client.get<Blob>("/download", { responseType: "blob" });
```

响应格式支持 `json`、`text`、`blob`、`arraybuffer`。路径参数自动编码；query 默认支持基本值和数组，嵌套对象需提供 `querySerializer`。JSON body 自动序列化，FormData、Blob、ArrayBuffer 等按原生请求体处理；上传 FormData 时让浏览器生成 Content-Type 和 boundary。

选择 Axios 时替换传输配置：

```ts
import { createAxiosTransport } from "requestlane/axios";

const axiosClient = createClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
});
```

需要访问原生能力时使用 transport 的 `native` 入口；直接调用该入口遵循原生库行为，不经过 Client 的端点、会话与缓存处理。Axios 不能保证 `credentials: "omit"` 的语义，此配置应使用 Fetch。

## 端点类型与运行时校验

将端点定义在模块作用域，复用同一端点对象：

```ts
import { defineEndpoint } from "requestlane";
import { z } from "zod";

const memberSchema = z.object({ id: z.string(), name: z.string() });
const memberDetail = defineEndpoint<{
  params: { id: string };
  data: z.output<typeof memberSchema>;
}>({
  method: "GET",
  path: "/members/:id",
  validator: memberSchema,
  cache: { ttl: 30_000, tags: ["members"] },
});

const detail = await client.call(memberDetail, { params: { id: "1" } });
```

端点可约束 `params`、`query`、`body` 与 `data`；声明了输入字段，就必须在 `call` 时提供。`call` 返回只读类型视图，需要编辑时复制数据。端点可省略 validator，此时只有静态约束；Zod 的转换输出也可参与类型推断。

```ts
const count = defineEndpoint({
  method: "GET",
  path: "/count",
  validator: z.string().transform(Number),
});
const value = await client.call(count, {}); // number
```

校验器也可提供自定义 `parse(value)`，返回值允许 Promise。异步 Zod 校验用 `validator: { parse: value => schema.parseAsync(value) }`。`inputValidators` 可分别校验 body/query/params：输入失败不派发，输出失败不缓存，错误为 `ValidationError`，原始原因保存在 `cause`。

## 内存缓存与写失效

响应缓存默认关闭；client 的 cache 配置只设置 TTL/容量，不自动开启缓存。GET 端点显式设置 `cache: true` 或 cache 配置后启用，默认 TTL 为 30 秒、容量为 20。不同 Client 的缓存相互独立，没有默认持久化。

```ts
const [first, second] = await Promise.all([
  client.call(memberDetail, { params: { id: "1" } }),
  client.call(memberDetail, { params: { id: "1" } }),
]); // 相同请求共享传输，成功结果进入内存缓存

await client.withInvalidation(["members"], () =>
  client.patch("/members/1", { name: "新名称" }),
);

client.invalidate({ tag: "members" });
client.invalidate({ endpoint: memberDetail });
await client.call(memberDetail, { params: { id: "1" } }, { bypassCache: true });
```

`withInvalidation` 接收创建写请求的函数，在执行前和结束后失效关联缓存。TTL 从响应解包与校验成功后开始，TTL=0 只合并在途请求；失败不缓存。相同端点及参数可复用，变化的身份、请求表示或不稳定的拦截器会隔离或绕过缓存。

## 会话请求

简单认证可直接设置 token，默认使用 `Authorization: Bearer ...`：

```ts
client.setToken("your-token");
await client.get("/me");
await client.get("/public", { anonymous: true });
client.clearToken();
```

动态会话使用应用状态提供 token 与身份版本：

```ts
const session = { token: "", version: 0 };
const sessionClient = createClient({
  baseURL: "/api",
  transport: createFetchTransport(),
  session: {
    token: () => session.token,
    sessionVersion: () => session.version,
    requireToken: true,
    onUnauthorized() {
      session.token = "";
      session.version++;
      sessionClient.invalidate();
    },
  },
});
```

登录、退出、换号或权限变化时更新 version；同身份 token 续期保持 version。认证 GET 使用缓存时需提供 `sessionVersion`。配置 provider 后直接更新应用状态，provider 优先于 `setToken`；匿名请求跳过认证与刷新。

需要刷新时，宿主提供 `ensureFreshToken`，负责刷新并发合并、返回最新 token 并同步应用状态。当前会话的 401 可触发 `onUnauthorized`；匿名、旧会话或 403/503 不会自动清除当前会话。登录及上传接入见 [auth-file.ts](./examples/auth-file.ts)。

## 超时、取消与错误

```ts
import { classifyError, isRequestCancelled } from "requestlane";

const controller = new AbortController();
const pending = client.get("/slow", {
  signal: controller.signal,
  timeout: 5_000,
});
controller.abort();

try {
  await pending;
} catch (error) {
  if (!isRequestCancelled(error)) {
    const info = classifyError(error);
    console.error(info.kind, info.status, info.message);
  }
}
```

默认超时为 15 秒，包含校验、刷新等待和传输；timeout=0 关闭超时。共享缓存请求中，单个调用取消只退出自己的等待，最后一个调用退出才取消共享传输。

错误可区分 HTTP、network、timeout、cancelled、protocol、validation 和 business；未知外部错误归为 unknown。HTTP `status` 保留真实状态，业务映射使用 `businessCode`/`suggestedStatus`。包不会自动重试写请求。

## 自定义响应协议

默认 codec 直接返回 JSON 数据。若接口返回 `{ code, msg, data }`，可显式启用协议助手：

```ts
import { sendsCodec } from "requestlane/response/sends";

const envelopeClient = createClient({
  baseURL: "/api",
  transport: createFetchTransport(),
  codec: sendsCodec,
});
const member = await envelopeClient.get<Member>("/members/1"); // 返回 data
```

以 code=0 为成功，未提供 code 时以 msg="ok" 为成功，成功响应必须包含 data。它是可选协议，不影响普通 JSON 接口。

其他协议通过 `createCodec({ parse, unwrap })` 定义：parse 检查 envelope，unwrap 提取业务数据或抛出 BusinessError。`requestEnvelope` 只解析 envelope，`requestData` 解析后解包，`requestRaw` 返回传输响应。运行时 validator 在业务数据解包后执行。

## Service 与资源释放

应用可直接组合 Client，也可继承 `BaseService` 集中定义端点与写失效规则，见 [services.ts](./examples/services.ts)。Client 由应用持有并共享，不要每次请求都创建新实例；实例不再使用时调用 `dispose()`，释放缓存并取消在途请求。

示例使用假定的 `/members`、`/auth/login`、`/files` 接口，不会在导入时发送请求。示例源码随包放在 `examples` 目录，也可从[源码仓库](https://github.com/abcde1239/requestlane/tree/master/examples)复制到已安装 requestlane 的项目，按自己的 API 调整。
