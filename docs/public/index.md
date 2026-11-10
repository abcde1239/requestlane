# requestlane 文档

框架无关的 TypeScript 前端通信包，支持 Axios、Fetch、类型端点和按需启用的内存缓存。

首次使用，沿[快速开始](./guides/usage.md)完成请求，再按需要添加校验、缓存和会话；已有 Axios、查询或认证工具时，先看[与已有工具配合](./guides/integrations.md)。

## 模块 API

| 模块                                | API 内容                                               |
| ----------------------------------- | ------------------------------------------------------ |
| [Client](./reference/client.md)     | 工厂、配置字段、请求方法、端点、传输及生命周期接口     |
| [Cache](./reference/cache.md)       | ReadCache、缓存工厂、读取参数、策略、失效接口与默认值  |
| [Session](./reference/session.md)   | 会话工厂、SessionOptions、凭证方法、认证配置与回调行为 |
| [Response](./reference/response.md) | 响应类型、codec、Validator、协议助手与错误类型         |
| [Service](./reference/service.md)   | BaseService 的构造参数、实例属性与可见性               |

Client 的[端点类型与校验](./guides/validation.md)单独展开 Zod、输入转换、默认值和异步校验。需要将缓存与会话组合到 core 时，见[模块组合](./guides/modules.md)。

## 其他资料

- [与已有工具配合](./guides/integrations.md)：复用 Axios、查询缓存、认证及框架能力。
- [包入口参考](./reference/exports.md)：导出、运行环境与版本说明。

[npm](https://www.npmjs.com/package/requestlane) · [返回 README](https://github.com/abcde1239/requestlane/blob/master/README.md)
