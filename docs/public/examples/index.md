# 使用示例

[文档首页](../index.md) · [快速开始](../guides/usage.md)

示例使用公开包入口，覆盖完整客户端、模块组合与 schema 推断。在项目中执行 `npm install requestlane` 后即可复制使用，需要 requestlane 0.1.4 或更高版本。

| 示例                                                                                             | 内容                                 | 对应指南                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------- |
| [basic.ts](https://github.com/abcde1239/requestlane/blob/master/examples/basic.ts)               | 完整与最小客户端、能力组合、独立缓存 | [模块组合](../guides/modules.md)                                     |
| [cache-schema.ts](https://github.com/abcde1239/requestlane/blob/master/examples/cache-schema.ts) | Zod 推断、并发缓存与写失效           | [类型与校验](../guides/validation.md)、[缓存](../reference/cache.md) |
| [auth-file.ts](https://github.com/abcde1239/requestlane/blob/master/examples/auth-file.ts)       | 登录、身份版本、匿名请求与上传       | [会话](../reference/session.md)                                      |
| [services.ts](https://github.com/abcde1239/requestlane/blob/master/examples/services.ts)         | 领域 Service、分页与共享客户端       | [Service](../reference/service.md)                                   |

示例随包放在 `examples/` 目录，导入示例不会自动发送请求。接口路径和业务字段需按实际 API 调整；浏览器可使用 `/api`，Node 环境使用完整 URL。
