# requestlane 文档

框架无关的 TypeScript 前端通信包，支持 Axios、Fetch、类型端点和按需启用的内存缓存。

首次使用，从[快速开始](./guides/usage.md)阅读；已有客户端时，直接查看对应主题。

| 指南                                 | 解决的问题                             |
| ------------------------------------ | -------------------------------------- |
| [模块组合](./guides/modules.md)      | 选择完整客户端，或按需添加缓存与会话   |
| [类型与校验](./guides/validation.md) | 从 Zod schema 推断类型并校验请求和响应 |
| [内存缓存](./guides/cache.md)        | 缓存异步结果、合并读取并处理写失效     |
| [会话](./guides/sessions.md)         | 设置凭证、管理身份变化和未授权响应     |
| [请求与错误](./guides/advanced.md)   | 上传文件、取消请求和处理响应协议       |

- [包入口参考](./reference/exports.md)：导出、运行环境与版本说明。
- [使用示例](./examples/README.md)：可复制的完整代码。

[npm](https://www.npmjs.com/package/requestlane) · [返回 README](../../README.md)
