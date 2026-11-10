import { createClient } from "requestlane";
import { createFetchTransport } from "requestlane/fetch";
import { createAxiosTransport } from "requestlane/axios";
import { createClient as createCoreClient } from "requestlane/core";
import { ReadCache, createMemoryCache } from "requestlane/cache";
import { createSession } from "requestlane/session";

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

// 最小入口不初始化缓存或会话。传输仍由调用方显式选择。
export function createMinimalHttpClient(baseURL: string) {
  return createCoreClient({ baseURL, transport: createFetchTransport() });
}

// 两种能力可分别省略；每个客户端拥有独立缓存和手动凭证。
export function createComposedHttpClient(baseURL: string) {
  return createCoreClient({
    baseURL,
    transport: createAxiosTransport(),
    cache: createMemoryCache({ ttl: 30_000, capacity: 20 }),
    session: createSession(),
  });
}

// ReadCache 与 HTTP 无关，也能缓存计算、SDK 调用等异步结果。
export async function cacheCalculation() {
  const cache = new ReadCache();
  try {
    return await cache.get("answer", async () => 42);
  } finally {
    cache.clear();
  }
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
