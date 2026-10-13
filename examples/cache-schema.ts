import { defineEndpoint, type Client } from "requestlane";
import { z } from "zod";

const memberSchema = z.object({ id: z.string(), name: z.string() });
export const memberDetail = defineEndpoint<{
  params: { id: string };
  data: z.output<typeof memberSchema>;
}>({
  method: "GET",
  path: "/members/:id",
  validator: memberSchema,
  cache: { ttl: 30_000, tags: ["members"] },
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
    client.patch(`/members/${encodeURIComponent(id)}`, { name }),
  );
  // 写请求前及结束后清理关联缓存；读取返回经 schema 校验的新结果。
  return client.call(memberDetail, { params: { id } });
}
