import { defineEndpoint, type Client } from "requestlane";
import { z } from "zod";

const memberSchema = z.object({ id: z.string(), name: z.string() });
const memberParams = z.object({ id: z.string().min(1) });
export const memberDetail = defineEndpoint({
  method: "GET",
  path: "/members/:id",
  inputValidators: { params: memberParams },
  validator: memberSchema,
  cache: { ttl: 30_000, tags: ["members"] },
});

export const renameMember = defineEndpoint({
  method: "PATCH",
  path: "/members/:id",
  inputValidators: {
    params: memberParams,
    body: z.object({ name: z.string().trim().min(1) }),
  },
  validator: memberSchema,
});

// 同一端点对象保持稳定，参数相同的并发读取会共享一次传输。
export async function cachedReads(client: Client, id: string) {
  const [first, second] = await Promise.all([
    client.call(memberDetail, { params: { id } }),
    client.call(memberDetail, { params: { id } }),
  ]);
  return { first, second };
}

export async function renameAndReload(
  client: Client,
  id: string,
  name: string,
) {
  await client.withInvalidation(["members"], () =>
    client.call(renameMember, { params: { id }, body: { name } }),
  );
  // 写请求前及结束后清理关联缓存；读取返回经 schema 校验的新结果。
  return client.call(memberDetail, { params: { id } });
}
