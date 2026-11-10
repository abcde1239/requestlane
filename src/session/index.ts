import type {
  CapabilityHost,
  SessionBinding,
  SessionContext,
  SessionFactory,
  SessionSnapshot,
} from "@/core/capabilities";
import type { SessionOptions } from "@/types/session";
import type { RequestConfig } from "@/types/request";
import { mergeHeaders } from "@/utils/serialization";
import { bearerToken, raceSignal } from "@/request/lifecycle";
import { cancelled, CommunicationError } from "@/response/errors";

export type { SessionOptions } from "@/types/session";

/** 工厂可复用；每个客户端分别保存手动凭证与已观察的身份。 */
export function createSession(options?: SessionOptions): SessionFactory {
  return (host) => new Session(host, options ? { ...options } : undefined);
}

class Session implements SessionBinding {
  private manualToken = "";
  private observedScope;

  constructor(
    private readonly host: CapabilityHost,
    private readonly options: SessionOptions | undefined,
  ) {
    this.observedScope = options?.sessionVersion?.();
  }
  private get authHeader(): string {
    return (this.host.options.auth?.header ?? "authorization").toLowerCase();
  }
  private formatToken(token: string): string {
    return token.trim()
      ? (this.host.options.auth?.format ?? bearerToken)(token)
      : "";
  }
  setToken(token: string): void {
    const old = this.formatToken(this.manualToken);
    const normalized = this.formatToken(token);
    this.manualToken = token;
    if (!this.options?.token) {
      const headers = mergeHeaders(this.host.options.headers);
      const hadDefault =
        headers[this.authHeader] !== undefined ||
        headers.authorization !== undefined;
      delete headers[this.authHeader];
      delete headers.authorization;
      this.host.options.headers = headers;
      if (normalized !== old || hadDefault) this.host.identityChanged();
    }
  }
  begin(): SessionSnapshot {
    const version = this.options?.sessionVersion?.();
    if (version !== this.observedScope) {
      this.host.identityChanged();
      this.observedScope = version;
    }
    return {
      version,
      assertCurrent: () => {
        if (
          this.options?.sessionVersion &&
          version !== this.options.sessionVersion()
        )
          throw cancelled();
      },
    };
  }
  async authorize(
    config: RequestConfig,
    headers: Record<string, string>,
    snapshot: SessionSnapshot,
    signal: AbortSignal,
  ): Promise<SessionContext> {
    const session = this.options;
    const anonymous = config.anonymous ?? false;
    let token = anonymous
      ? ""
      : config.sessionToken !== undefined
        ? config.sessionToken
        : session?.token
          ? session.token()
          : this.manualToken;
    if (
      !anonymous &&
      config.sessionToken === undefined &&
      session?.ensureFreshToken
    ) {
      token = await raceSignal(session.ensureFreshToken(), signal);
      snapshot.assertCurrent();
      if (
        session.token &&
        this.formatToken(token) !== this.formatToken(session.token())
      )
        throw cancelled();
    }
    if (!anonymous && session?.requireToken && !token)
      throw new CommunicationError("Authentication required", "http", {
        status: 401,
      });
    if (anonymous || session) {
      delete headers.authorization;
      delete headers[this.authHeader];
      if (token) headers[this.authHeader] = this.formatToken(token);
    } else if (!headers[this.authHeader] && token)
      headers[this.authHeader] = this.formatToken(token);
    const selectedToken = this.formatToken(token);
    const assertToken = () => {
      if (
        !anonymous &&
        session?.token &&
        !session.sessionVersion &&
        selectedToken !== this.formatToken(session.token())
      )
        throw cancelled();
    };
    return {
      token,
      selectedToken,
      initialVersion: snapshot.version,
      requiresCacheScope: !!(
        (session?.token || session?.ensureFreshToken) &&
        !session.sessionVersion &&
        !anonymous
      ),
      assertResponse: assertToken,
      assertConsumer: () => {
        if (config.sessionToken === undefined) assertToken();
      },
      unauthorized: async (transportSignal) => {
        if (
          session?.onUnauthorized &&
          !anonymous &&
          selectedToken &&
          (!session.token ||
            this.formatToken(session.token()) === selectedToken)
        ) {
          await raceSignal(
            Promise.resolve(session.onUnauthorized()),
            transportSignal,
          );
        }
      },
    };
  }
}
