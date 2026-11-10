# 请求、错误与响应协议

[文档首页](../README.md) · [快速开始](./usage.md) · [类型与校验](./validation.md)

## 请求参数

```ts
import { createClient, classifyError, isRequestCancelled } from "requestlane";
import { createAxiosTransport } from "requestlane/axios";

const client = createClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
});

const raw = await client.requestRaw({
  url: "/members/:id",
  params: { id: "1" },
  query: { detailed: true },
});

console.log(raw.status, raw.headers, raw.data);
```

`params` 替换路径中的 `:name`，`query` 生成查询字符串。路径参数自动编码；query 支持基本值与数组，嵌套对象需自行提供 `querySerializer`。

| 方法                                                   | 返回值                              |
| ------------------------------------------------------ | ----------------------------------- |
| `get`、`post`、`put`、`patch`、`delete`、`requestData` | 协议解包后的业务数据                |
| `requestEnvelope`                                      | 已解析、未解包的 envelope           |
| `head`、`requestRaw`                                   | 含 status、headers、data 的传输响应 |

## 文件与响应格式

```ts
const text = await client.get<string>("/notice", { responseType: "text" });
const file = await client.get<Blob>("/download", { responseType: "blob" });

const form = new FormData();
form.set("file", new Blob(["hello"], { type: "text/plain" }), "hello.txt");
const uploaded = await client.post<{ url: string }>("/files", form);
```

响应格式支持 `json`、`text`、`blob`、`arraybuffer`，默认 `json`。普通 JSON 请求体自动序列化，FormData、Blob、ArrayBuffer 等按原生请求体处理。上传 FormData 时让浏览器生成 Content-Type 和 boundary。

Axios 无法保证 `credentials: "omit"` 的语义，需要完全省略凭证时选择 Fetch。transport 的 `native` 入口遵循原生库行为，直接调用它会绕过客户端的端点、会话与缓存处理。

## 超时与取消

```ts
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

默认超时为 15 秒，覆盖校验、刷新等待与传输；`timeout: 0` 关闭超时。缓存请求的独立取消行为见[内存缓存](./cache.md#会话与取消)。

## 错误类型

| kind         | 含义                     |
| ------------ | ------------------------ |
| `http`       | HTTP 状态失败            |
| `network`    | 网络请求失败             |
| `timeout`    | 调用超时                 |
| `cancelled`  | 调用取消或所属身份失效   |
| `protocol`   | 响应解析或协议不符合约定 |
| `validation` | 输入或响应数据校验失败   |
| `business`   | 协议定义的业务失败       |
| `unknown`    | 无法归类的外部错误       |

`classifyError` 返回便于展示的错误信息，`isRequestCancelled` 用于判断取消。配置错误也可能直接抛出 TypeError。HTTP `status` 保留真实状态，业务映射使用 `businessCode` 和 `suggestedStatus`。

## 响应协议

普通 JSON 接口无须配置 codec。接口返回 `{ code, msg, data }` 时，可显式使用 `sendsCodec`：

```ts
import { sendsCodec } from "requestlane/response/sends";

const envelopeClient = createClient({
  baseURL: "/api",
  transport: createAxiosTransport(),
  codec: sendsCodec,
});

const member = await envelopeClient.get<{ id: string }>("/members/1");
```

该协议以 `code: 0` 为成功；未提供 code 时，以 `msg: "ok"` 为成功。成功响应必须包含 data，示例返回的 member 是 data 字段。

其他协议使用 `createCodec({ parse, unwrap })`：parse 检查 envelope，unwrap 提取业务数据或抛出 BusinessError。端点的运行时 validator 在解包后执行，见[类型与校验](./validation.md)。

## Service 与资源释放

领域接口可以直接组合客户端，也可继承根入口的 `BaseService` 集中定义端点与写失效，见[Service 示例](../../../examples/services.ts)。

应用应复用客户端，在模块或应用不再使用它时调用 `dispose()`，释放缓存并取消在途请求。独立缓存使用 `clear()` 清理。
