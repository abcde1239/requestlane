import { createClient } from "frontcache";
import { createFetchTransport } from "frontcache/fetch";
import { createAxiosTransport } from "frontcache/axios";

export interface Member {
  id: string;
  name: string;
}

// 浏览器可传 /api；Node 使用完整地址。默认请求和响应都是普通 JSON。
export function createHttpClient(baseURL: string) {
  return createClient({
    baseURL,
    transport: createFetchTransport(),
    timeout: 15_000,
  });
}

// 选择 Axios 时只需替换 transport，无需自行创建 Axios 实例。
export function createAxiosHttpClient(baseURL: string) {
  return createClient({ baseURL, transport: createAxiosTransport() });
}

export async function basicUsage(baseURL: string) {
  const client = createHttpClient(baseURL);
  try {
    // 泛型声明响应类型；需要校验服务器数据时配置 endpoint.validator。
    const member = await client.get<Member>("/members/1");
    const updated = await client.patch<Member>("/members/1", {
      name: "新名称",
    });
    const raw = await client.requestRaw<Member>({ url: "/members/1" });
    return { member, updated, status: raw.status };
  } finally {
    client.dispose();
  }
}
