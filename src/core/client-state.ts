import type {
  CoreClientOptions,
  RequestClientOptions,
} from "@/core/client-options";
import type { CacheBinding, SessionBinding } from "@/core/capabilities";
import { checkTimeout } from "@/request/lifecycle";
import { cancelled } from "@/response/errors";
/** 核心只拥有调用生命周期；可选能力按实例创建。 */
export class ClientState {
  readonly cache?: CacheBinding;
  readonly session?: SessionBinding;
  readonly options: RequestClientOptions;
  generation = 0;
  disposed = false;
  lifetimes = new Set<AbortController>();
  constructor(options: CoreClientOptions) {
    checkTimeout(options.timeout ?? 15000);
    const { cache, session, ...requestOptions } = options;
    this.options = { ...requestOptions, headers: { ...options.headers } };
    this.cache = cache?.(this);
    this.session = session?.(this);
  }
  identityChanged(): void {
    this.generation++;
    this.cache?.store.clear();
  }
  dispose(): void {
    this.disposed = true;
    this.identityChanged();
    for (const controller of this.lifetimes) controller.abort(cancelled());
    this.lifetimes.clear();
  }
}
