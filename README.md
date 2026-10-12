# frontcache

框架无关的 TypeScript 前端通信包，包含常见的会话请求与基础缓存管理。

支持 Fetch、Axios、请求与响应类型约束、运行时校验，以及超时和取消。缓存以内存为主，按需开启，支持 TTL、并发合并与失效。

适用于现代浏览器和 Node 20+，提供 ESM 与类型声明，支持 TypeScript 5.0+。

## 安装

从 npm 安装：

```bash
npm install frontcache
```


## 基本请求

```ts
import { createClient } from 'frontcache'
import { createFetchTransport } from 'frontcache/fetch'

interface Member { id: string; name: string }

const client = createClient({
  baseURL: '/api',
  transport: createFetchTransport(),
  timeout: 15_000
})

const member = await client.get<Member>('/members/1')
await client.patch('/members/1', { name: '新名称' })

client.setToken('your-token') // 默认使用 Bearer 认证
await client.get('/public', { anonymous: true })
client.clearToken()
```

支持 GET、POST、PUT、PATCH、DELETE 等请求，默认返回 JSON 数据。未声明响应类型时返回 `unknown`。需要 Axios 时，将传输配置换成 `createAxiosTransport()`（从 `frontcache/axios` 导入）。

```ts
import { createAxiosTransport } from 'frontcache/axios'

const axiosClient = createClient({
  baseURL: '/api',
  transport: createAxiosTransport()
})
```

## 类型与缓存

```ts
import { defineEndpoint } from 'frontcache'

const memberDetail = defineEndpoint<{
  params: { id: string }
  data: Member
}>({
  method: 'GET',
  path: '/members/:id',
  cache: { ttl: 30_000, tags: ['members'] }
})

const detail = await client.call(memberDetail, { params: { id: '1' } })

await client.withInvalidation(['members'], () =>
  client.patch('/members/1', { name: '新名称' })
)
client.invalidate({ tag: 'members' })
client.dispose() // 使用结束时释放缓存与在途请求
```

端点可约束路径参数、query、body 和响应类型。缓存默认关闭，GET 端点显式开启后使用内存缓存，默认 TTL 为 30 秒、容量为 20；同键并发请求合并，失败结果不缓存。

## 运行时校验

Zod 随 frontcache 自动安装，也可接入自定义 `parse` 校验器，校验结果自动推断类型：

```ts
import { z } from 'zod'

const endpoint = defineEndpoint({
  method: 'GET',
  path: '/me',
  validator: z.object({ id: z.string(), name: z.string() })
})

const me = await client.call(endpoint, {})
```

异步校验使用 `validator: { parse: value => schema.parseAsync(value) }`。校验失败会拒绝请求，响应不会写入缓存。

动态会话可通过 `session` 配置 token、刷新等待和 401 回调；认证查询使用缓存时需提供 `sessionVersion`，在身份变化时更新。业务响应可通过 `codec` 自定义，旧 sends 接口由 `frontcache/compat/sends` 提供。
