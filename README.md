# frontcache

[![npm version](https://img.shields.io/npm/v/frontcache)](https://www.npmjs.com/package/frontcache)
[![npm downloads](https://img.shields.io/npm/dm/frontcache)](https://www.npmjs.com/package/frontcache)
[![license](https://img.shields.io/npm/l/frontcache)](./LICENSE)

框架无关的 TypeScript 前端通信包，包含常见的会话请求与基础缓存管理。

支持 Fetch、Axios、强类型端点、Zod 或自定义运行时校验、超时与取消。缓存按需开启，使用实例内内存，支持 TTL、并发合并和按标签失效。

## 安装

```bash
npm install frontcache
```

## 快速使用

```ts
import { createClient } from "frontcache";
import { createFetchTransport } from "frontcache/fetch";

const client = createClient({
  baseURL: "/api", // Node 环境使用完整 URL
  transport: createFetchTransport(),
});

const member = await client.get<{ id: string; name: string }>("/members/1");
await client.patch("/members/1", { name: "新名称" });

client.dispose(); // 应用或模块不再使用该实例时释放资源
```

需要 Axios 时，改用 `createAxiosTransport()`（从 `frontcache/axios` 导入）。泛型提供编译期约束；运行时校验与缓存通过 `defineEndpoint` 配置。

## [相关文档](./USAGE.md)

## 示例

- [基本请求](./examples/basic.ts)
- [类型校验与缓存](./examples/cache-schema.ts)
- [会话与文件上传](./examples/auth-file.ts)
- [Service 组合](./examples/services.ts)

## npm 信息

包名：[`frontcache`](https://www.npmjs.com/package/frontcache) · 许可证：[MIT](./LICENSE) · [源码](https://github.com/abcde1239/frontcache) · [问题反馈](https://github.com/abcde1239/frontcache/issues)

```bash
npm view frontcache version
```
