import type { ClientOptions } from "@/core/client-options";
import { CoreClient } from "@/core/core-client";
import { createMemoryCache } from "@/cache/http-cache";
import type { ReadCache } from "@/cache/read-cache";
import { createSession } from "@/session/index";
export type { ClientOptions } from "@/core/client-options";
/** 完整门面保留旧 API；内部复用同一个请求核心。 */
export class Client extends CoreClient {
  constructor(options: ClientOptions) {
    super({
      ...options,
      cache: createMemoryCache(options.cache),
      session: createSession(options.session),
    });
  }
  override get cache(): ReadCache {
    return super.cache as ReadCache;
  }
}
export function createClient(options: ClientOptions): Client {
  return new Client(options);
}
