# 快速开始

[文档首页](../README.md) · [包入口](../reference/exports.md) · [使用示例](../examples/README.md)

requestlane 将请求、类型校验、缓存与会话组合在同一个包中。先创建客户端，再按需求配置端点和能力。

## 安装

```bash
npm install requestlane
```

Axios、Zod 随包自动安装，无须分别安装模块子路径。包提供 ESM，适用于现代浏览器和 Node 20+。

## 发送第一个请求

```ts
import { createClient } from "requestlane";
import { createFetchTransport } from "requestlane/fetch";

const client = createClient({
  baseURL: "https://example.com/api",
  transport: createFetchTransport(),
});

interface Member {
  id: string;
  name: string;
}

const member = await client.get<Member>("/members/1");
console.log(member.name);
```

示例假定接口返回 `{ id, name }`。客户端默认将普通 JSON 作为业务数据返回，无须访问 `response.data`。泛型只提供编译期约束，需要校验服务器数据时使用[类型与校验](./validation.md)。

浏览器可使用相对 baseURL；Node 环境应使用 `https://example.com/api` 等完整地址。

## 选择传输

Axios 与 Fetch 均需显式选择。使用 Axios 时替换 transport，其他调用方式相同：

```ts
import { createAxiosTransport } from "requestlane/axios";

const axiosClient = createClient({
  baseURL: "https://example.com/api",
  transport: createAxiosTransport(),
});
```

## 发送数据

继续使用本页的 client：

```ts
await client.post<Member>("/members", { name: "Ada" });
await client.patch<Member>("/members/1", { name: "新名称" });
await client.delete("/members/1");

const raw = await client.requestRaw<Member>({ url: "/members/1" });
console.log(raw.status, raw.data);
```

`get/post/put/patch/delete` 返回业务数据；`head/requestRaw` 返回带状态、响应头和数据的传输响应。路径参数、文件、响应格式与错误处理见[请求与错误](./advanced.md)。

客户端可在应用模块内复用；不再使用时调用 `client.dispose()`。不要为每个请求重新创建实例。

## 按需组合模块

根入口 `requestlane` 提供完整客户端。只需要请求与校验时，从 `requestlane/core` 创建客户端；需要缓存或会话时，分别添加 `createMemoryCache`、`createSession`。详见[模块组合](./modules.md)。

## 端点类型与运行时校验

使用 `defineEndpoint` 定义方法、路径、输入 schema 和响应 schema，再通过 `client.call` 调用。Zod schema 可直接参与类型推断，详见[类型与校验](./validation.md)。

## 下一步

- [内存缓存](./cache.md)：独立缓存、缓存 GET 请求与写失效。
- [会话](./sessions.md)：token、身份切换和未授权处理。
- [包入口参考](../reference/exports.md)：配置入口与运行环境。
