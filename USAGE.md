# requestlane 使用文档

[在线文档站](https://abcde1239.github.io/requestlane/)与本地 Markdown 使用同一份公开内容。

从[快速开始](./docs/public/guides/usage.md)安装并发送第一个请求，再按需要添加校验、缓存或会话。

本文档适用于 requestlane 0.1.4 及以上版本，支持从独立入口组合请求、缓存与会话。导入路径见[包入口参考](./docs/public/reference/exports.md)。

快速开始之外，按以下模块查阅 API 参数、默认值、返回值和错误行为：

| 模块                                            | 内容                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Client](./docs/public/reference/client.md)     | 客户端工厂、配置、请求方法、端点与传输接口；配套[类型与校验](./docs/public/guides/validation.md) |
| [Cache](./docs/public/reference/cache.md)       | ReadCache、缓存工厂、读取参数、缓存策略与失效接口                                                |
| [Session](./docs/public/reference/session.md)   | 会话工厂、SessionOptions、凭证方法与回调行为                                                     |
| [Response](./docs/public/reference/response.md) | 响应类型、codec、协议助手与错误类型                                                              |
| [Service](./docs/public/reference/service.md)   | BaseService 构造参数与实例属性                                                                   |

其他资料：[模块组合](./docs/public/guides/modules.md) · [与已有工具配合](./docs/public/guides/integrations.md) · [包入口参考](./docs/public/reference/exports.md) · [使用示例](./docs/public/examples/index.md)。

[返回 README](./README.md)
