import type { Client } from "../src/index.js";

/** 登录路径、刷新持久化、并发合并由应用负责，不在核心中固定。 */
export class AppAuth<User> {
  constructor(private readonly http: Client) {}
  login(identifier: string, password: string) {
    return this.http.post<
      { token: string; user: User },
      { identifier: string; password: string }
    >("/token", { identifier, password }, { anonymous: true });
  }
  refresh(token: string) {
    return this.http.post<{ new_token: string }>("/refresh", undefined, {
      sessionToken: token,
    });
  }
}
export class AppFiles<Authorization> {
  constructor(
    private readonly http: Client,
    private readonly uploader: (
      file: File,
      authorization: Authorization,
      signal?: AbortSignal,
    ) => Promise<string>,
  ) {}
  async upload(
    target: string,
    file: File,
    signal?: AbortSignal,
  ): Promise<string> {
    const authorization = await this.http.post<
      Authorization,
      { target: string }
    >("/sts", { target }, { signal });
    const url = await this.uploader(file, authorization, signal);
    if (!url) throw new Error("Upload did not return a URL");
    return url;
  }
}
