# 请求、错误与响应协议

[文档首页](../index.md) · [快速开始](./usage.md)

请求与响应的详细说明已按模块整理到 [Client 与 Core](../reference/client.md)、[Response](../reference/response.md) 和 [Service](../reference/service.md)。本页保留原有小节入口，便于从快速开始或旧链接继续阅读。

## 请求参数

路径参数、查询字符串、请求体和请求选项见 [Client：请求参数](../reference/client.md#请求参数)。请求方法及返回值见[请求方法](../reference/client.md#请求方法)。

## 文件与响应格式

JSON、FormData、Blob 与响应格式示例见 [Client：文件与响应格式](../reference/client.md#文件与响应格式)。

## 超时与取消

默认超时、AbortSignal 与取消示例见 [Client：超时与取消](../reference/client.md#超时与取消)；共享请求的规则见 [Cache：会话与取消](../reference/cache.md#会话与取消)。

## 错误类型

错误分类、HTTP 状态与业务代码见 [Response：错误处理](../reference/response.md#错误处理)。

## 响应协议

默认响应行为、requestData/requestEnvelope、Sends 协议与自定义 codec 见 [Response](../reference/response.md)。

## Service 与资源释放

领域接口组织、BaseService 与共享客户端见 [Service](../reference/service.md)；客户端释放见 [Client：实例复用与释放](../reference/client.md#实例复用与释放)。
