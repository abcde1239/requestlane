import {
    AxiosHeaders,
    type AxiosRequestConfig,
    type AxiosResponse,
    type CreateAxiosDefaults
} from 'axios'
import { HttpRequest } from './request.js'
import { fetchAdapter } from './fetchAdapter.js'
import { bearerToken } from '../../request/lifecycle.js'
import { requestLifetime } from '../../request/lifecycle.js'
import { BusinessError, InvalidResponseError, unwrapResponse } from './response.js'
import { responseErrorInfo, type ErrorKind } from './errors.js'
import type { StandardResponse } from './response.js'

export interface ServiceOptions {
    /** Explicit marker for app services that expose both constructor modes. */
    transport?: 'session'
    baseURL?: string
    token?: () => string
    ensureFreshToken?: () => Promise<string>
    sessionVersion?: () => number
    onUnauthorized?: () => void
    timeout?: number
    adapter?: CreateAxiosDefaults['adapter']
    fetcher?: typeof fetch
    requireToken?: boolean
}

export interface SessionRequestConfig<Body = unknown> extends AxiosRequestConfig<Body> {
    anonymous?: boolean
    /** Internal per-request credential used by refresh flows; never sent to Axios. */
    sessionToken?: string
}

export const anonymousRequest: SessionRequestConfig = { anonymous: true }

export class ServiceError extends Error {
    constructor(
        message: string,
        public status = 0,
        public businessCode?: number,
        public kind: ErrorKind = 'http',
        public code = '',
        cause?: unknown
    ) {
        super(message, { cause })
        this.name = 'ServiceError'
    }
}

function waitForToken(pending: Promise<string>, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
        const cleanup = () => signal?.removeEventListener('abort', cancel)
        const cancel = () => {
            cleanup()
            reject(new DOMException('请求已取消', 'AbortError'))
        }
        if (signal?.aborted) {
            cancel()
            return
        }
        signal?.addEventListener('abort', cancel, { once: true })
        pending.then(
            (token) => {
                cleanup()
                resolve(token)
            },
            (error) => {
                cleanup()
                reject(error)
            }
        )
    })
}

/** 新request，主要是用于适配ReadCache，以及对一些业务情况的处理 */
export class SessionHttpRequest extends HttpRequest {
    private manualToken = ''

    constructor(
        baseURL: string,
        protected readonly options: ServiceOptions = {}
    ) {
        super({
            baseURL,
            timeout: 0,
            validateStatus: () => true,
            adapter:
                options.adapter || (options.fetcher ? fetchAdapter(options.fetcher) : undefined)
        })
    }

    /**
     * Keep the old mutable-token API usable for session clients that have no
     * token provider. A configured provider remains authoritative.
     */
    override setToken(token: string) {
        this.manualToken = token
        // Credentials are selected per request; Axios defaults must not revive a stale token.
        super.setToken('')
    }

    override request<Data = unknown, Body = unknown>(config: SessionRequestConfig<Body>): Promise<StandardResponse<Data>> {
        return super.request<Data, Body>(config)
    }
    override get<Data = unknown>(url: string, config?: SessionRequestConfig): Promise<StandardResponse<Data>> {
        return this.request<Data>({ ...config, method: 'GET', url })
    }
    override post<Body = unknown, Data = unknown>(url: string, data?: Body, config?: SessionRequestConfig<Body>): Promise<StandardResponse<Data>> {
        return this.request<Data, Body>({ ...config, method: 'POST', url, data })
    }
    override patch<Body = unknown, Data = unknown>(url: string, data?: Body, config?: SessionRequestConfig<Body>): Promise<StandardResponse<Data>> {
        return this.request<Data, Body>({ ...config, method: 'PATCH', url, data })
    }
    override delete<Data = unknown>(url: string, config?: SessionRequestConfig): Promise<StandardResponse<Data>> {
        return this.request<Data>({ ...config, method: 'DELETE', url })
    }

    override async requestRaw<Data = unknown, Body = unknown>(
        config: SessionRequestConfig<Body>
    ): Promise<AxiosResponse<Data, Body>> {
        const { anonymous = false, sessionToken, ...axiosConfig } = config
        const signal = config.signal as AbortSignal | undefined
        if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
        const providerToken = this.options.token
        let token = anonymous
            ? undefined
            : sessionToken !== undefined
              ? sessionToken
              : providerToken
                ? providerToken()
                : this.manualToken

        if (!anonymous && sessionToken === undefined && this.options.ensureFreshToken) {
            const sessionVersion = this.options.sessionVersion?.()
            token = await waitForToken(this.options.ensureFreshToken(), signal)
            if (
                signal?.aborted ||
                (sessionVersion !== undefined && sessionVersion !== this.options.sessionVersion?.()) ||
                (providerToken && token !== providerToken())
            )
                throw new DOMException('会话已变更', 'AbortError')
        }

        if (!anonymous && this.options.requireToken && !token)
            throw new ServiceError('登录已失效，请重新登录', 401)
        const lifetime = requestLifetime(
            { signal: config.signal as AbortSignal | undefined, timeout: config.timeout },
            this.options.timeout ?? 15000
        )
        let status = 0
        const failure = (envelope: unknown, httpStatus?: number) => {
            const info = responseErrorInfo(envelope, httpStatus)
            const effectiveStatus = info.status || status
            const currentToken = providerToken ? providerToken() : this.manualToken
            if (effectiveStatus === 401 && !anonymous && token && token === currentToken)
                this.options.onUnauthorized?.()
            const data =
                envelope && typeof envelope === 'object' && 'data' in envelope
                    ? envelope.data
                    : undefined
            const reason =
                data && typeof data === 'object' && 'code' in data && typeof data.code === 'string'
                    ? data.code
                    : ''
            return new ServiceError(
                anonymous && status === 401 && info.code === undefined
                    ? '账号或密码错误'
                    : info.message,
                effectiveStatus,
                info.code,
                info.kind,
                reason
            )
        }
        try {
            lifetime.signal.throwIfAborted()
            const headers = AxiosHeaders.from(config.headers as AxiosHeaders)
            headers.delete('Authorization')
            if (token) headers.set('Authorization', bearerToken(token))
            const response = await super.requestRaw<Data, Body>({
                ...axiosConfig,
                headers,
                signal: lifetime.signal,
                timeout: 0
            })
            status = response.status
            lifetime.signal.throwIfAborted()
            if (status < 200 || status >= 300) throw failure(response.data, status)
            unwrapResponse(response.data)
            return response
        } catch (error) {
            if (error instanceof ServiceError) throw error
            if (error instanceof BusinessError) throw failure(error.envelope)
            if (error instanceof InvalidResponseError)
                throw new ServiceError(error.message, status, undefined, 'protocol')
            if (lifetime.signal.aborted && !lifetime.timedOut)
                throw new DOMException('请求已取消', 'AbortError')
            throw new ServiceError(
                lifetime.timedOut
                    ? '请求超时，请先确认操作结果再重试'
                    : '网络连接失败，请检查连接后重试',
                0,
                undefined,
                lifetime.timedOut ? 'timeout' : 'network',
                '',
                error
            )
        } finally {
            lifetime.dispose()
        }
    }
}
