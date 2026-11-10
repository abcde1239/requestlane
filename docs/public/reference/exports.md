# 包入口参考

[文档首页](../index.md) · [快速开始](../guides/usage.md)

## 安装与导入

::: code-group

```sh [npm]
npm install requestlane
```

```sh [pnpm]
pnpm add requestlane
```

```sh [yarn]
yarn add requestlane
```

```sh [bun]
bun add requestlane
```

:::

所有导入路径都属于同一个 npm 包，使用标准 ESM 导入，例如 `import { createClient } from "requestlane"`。以下入口适用于 0.1.4 及以上版本。

| 导入路径                     | 主要导出                                                                                   | 用途                      |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------------- |
| `requestlane`                | `Client`、`createClient`、`defineEndpoint`、`BaseService`、类型、codec 与错误工具          | 完整客户端                |
| `requestlane/core`           | `CoreClient`、`createCoreClient`、`createClient`、`defineEndpoint`、类型、codec 与错误工具 | 按需组合的请求客户端      |
| `requestlane/axios`          | `createAxiosTransport`、`AxiosTransportOptions`                                            | Axios 传输                |
| `requestlane/fetch`          | `createFetchTransport`、`Fetcher`、`FetchTransportOptions`                                 | Fetch 传输                |
| `requestlane/cache`          | `ReadCache`、`createMemoryCache`、缓存配置类型                                             | 独立缓存与请求缓存能力    |
| `requestlane/session`        | `createSession`、`SessionOptions`                                                          | 会话能力                  |
| `requestlane/response/sends` | `sendsCodec`、`createSendsCodec`、协议助手与类型                                           | 可选的 code/msg/data 协议 |

`requestlane/core` 中的 `createClient` 是 `createCoreClient` 的别名。根入口和核心入口的配置形式见[模块组合](../guides/modules.md#使用完整客户端)。

Axios、Zod 是必须运行依赖，随包自动安装。子路径隔离运行时加载与初始化，不改变 npm 依赖的下载范围。

## 运行环境

| 环境       | 要求                                                 |
| ---------- | ---------------------------------------------------- |
| 模块格式   | ESM                                                  |
| 浏览器     | 支持 Fetch、AbortController 等标准 API 的现代浏览器  |
| Node.js    | 20+；baseURL 使用完整 URL                            |
| Bun        | 已在 1.3.4 上运行现有测试；最低兼容版本尚未单独验证  |
| TypeScript | 核心类型支持 5.0+；Zod 使用场景还需满足 Zod 自身要求 |

客户端不会默认选择 transport。Axios、Fetch 或自定义 transport 都需要显式传入。

Deno、Cloudflare Workers 等其他运行时尚未纳入兼容性验证。核心与 Fetch transport 使用标准 Web API，但完整请求还依赖目标环境的 API 实现及包加载方式；不能据此视为已验证支持。需要接入这些环境时，优先使用 Fetch transport 并在目标环境验收。

## 版本说明

0.1.4 支持分模块导入，新增 `requestlane/core`、`requestlane/session` 与 `createMemoryCache`，支持独立使用缓存、为请求按需组合缓存和会话。同时支持从输入 schema 推断调用参数及直接使用异步 Zod 校验器。

根入口 `requestlane` 保留完整客户端及普通对象配置，已有 Axios、Fetch 用法可继续使用。

查看 registry 中的版本和导出：

```bash
npm view requestlane version
npm view requestlane exports --json
```

升级到支持分模块导入的版本：

```bash
npm install requestlane@^0.1.4
```
