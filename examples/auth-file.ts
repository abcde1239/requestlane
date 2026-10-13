import { createClient, type Client } from "requestlane";
import { createFetchTransport } from "requestlane/fetch";

interface LoginResult {
  token: string;
  member: { id: string; name: string };
}

// token 存储在应用状态；身份变更更新 version，同身份续期只更新 token。
export function createSessionApp(baseURL: string) {
  const session = { token: "", version: 0 };
  const clearSession = () => {
    session.token = "";
    session.version++;
    client.invalidate();
  };
  const client = createClient({
    baseURL,
    transport: createFetchTransport(),
    session: {
      token: () => session.token,
      sessionVersion: () => session.version,
      requireToken: true,
      onUnauthorized: clearSession,
      // 若需要刷新，可由宿主提供 ensureFreshToken，负责刷新并发合并与状态更新。
    },
  });
  return {
    client,
    async login(identifier: string, password: string) {
      const result = await client.post<LoginResult>(
        "/auth/login",
        { identifier, password },
        { anonymous: true },
      );
      session.token = result.token;
      session.version++;
      client.invalidate();
      return result.member;
    },
    logout: clearSession,
    dispose: () => client.dispose(),
  };
}

// 上传到应用自己的接口；浏览器自动生成 multipart boundary。
export function uploadFile(client: Client, file: File, signal?: AbortSignal) {
  const body = new FormData();
  body.set("file", file);
  return client.post<{ url: string }>("/files", body, { signal });
}
