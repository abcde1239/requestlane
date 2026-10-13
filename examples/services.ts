import { BaseService, defineEndpoint, type Client } from "requestkit";

interface Member {
  id: string;
  name: string;
}

const memberList = defineEndpoint<{
  query: { page: number; limit: number };
  data: { list: Member[]; total: number };
}>({
  method: "GET",
  path: "/members",
  cache: { tags: ["members"] },
});
const updateMember = defineEndpoint<{
  params: { id: string };
  body: { name: string };
  data: Member;
}>({ method: "PATCH", path: "/members/:id" });

// 应用持有并共享 client，service 只定义端点与失效规则。
export class MemberService extends BaseService {
  constructor(client: Client) {
    super("members", client);
  }

  list(page = 1, limit = 20, signal?: AbortSignal) {
    return this.http.call(memberList, { query: { page, limit } }, { signal });
  }

  rename(id: string, name: string) {
    return this.http.withInvalidation(["members"], () =>
      this.http.call(updateMember, { params: { id }, body: { name } }),
    );
  }
}
