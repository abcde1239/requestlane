# Service API

[文档首页](../index.md) · [Client API](./client.md) · [Cache API](./cache.md) · [完整示例](https://github.com/abcde1239/requestlane/blob/master/examples/services.ts)

## BaseService

| API           | 导入入口      | 类型   | 说明                                     |
| ------------- | ------------- | ------ | ---------------------------------------- |
| `BaseService` | `requestlane` | 抽象类 | 保存业务名称和客户端引用，由业务子类继承 |

不存在 `requestlane/service` 导出入口。

### 构造参数

构造签名：`constructor(serviceName: string, http: Client)`。

| 参数          | 类型     | 必填 | 默认值 | 说明                                                             |
| ------------- | -------- | ---- | ------ | ---------------------------------------------------------------- |
| `serviceName` | `string` | 是   | 无     | 业务名称，仅作为属性保存，不自动作为 URL 前缀或缓存标签          |
| `http`        | `Client` | 是   | 无     | 根入口的完整客户端实例；当前构造类型要求 Client，不是 CoreClient |

### 实例属性

| 属性          | 类型     | 可见性    | 可写性   | 说明                   |
| ------------- | -------- | --------- | -------- | ---------------------- |
| `serviceName` | `string` | public    | readonly | 构造时传入的业务名称   |
| `http`        | `Client` | protected | 可写     | 供子类访问的客户端引用 |

### 内置行为

| 项目                 | 行为                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| 请求、CRUD、分页方法 | BaseService 不声明这些方法，由业务子类或组合对象提供                                                      |
| 端点及标签配置       | 由业务定义，参见 [EndpointOptions](./client.md#endpointoptions) 和 [CachePolicy](./cache.md#配置与默认值) |
| 写失效               | 通过所属客户端的 withInvalidation 实现，BaseService 不额外提供失效 API                                    |
| 生命周期             | 不创建或销毁传入客户端，不提供独立 dispose；实例创建者管理客户端生命周期                                  |

BaseService 没有额外的配置校验或错误包装。子类调用客户端时遵循 [Client](./client.md) 和 [Response](./response.md#错误处理) 的行为。使用 CoreClient 时可直接以函数或对象组合业务接口，无须继承 BaseService；完整业务组织示例见 [services.ts](https://github.com/abcde1239/requestlane/blob/master/examples/services.ts)。
