import type { CreateAxiosDefaults } from 'axios'
import { HttpRequest, type RequestInterceptor } from './request.js'
import { SessionHttpRequest, type ServiceOptions } from './sessionRequest.js'
import { getData } from './response.js'

export type SessionRequestFactory = (baseURL: string, options: ServiceOptions) => HttpRequest

export abstract class BaseService {
    protected http: HttpRequest
    protected readonly transportMode: 'legacy' | 'session'
    readonly serviceName: string

    constructor(
        serviceName: string,
        url: string,
        config?: CreateAxiosDefaults,
        interceptor?: RequestInterceptor
    )
    constructor(serviceName: string, options: ServiceOptions, factory?: SessionRequestFactory)
    constructor(
        serviceName: string,
        urlOrOptions: string | ServiceOptions,
        configOrFactory: CreateAxiosDefaults | SessionRequestFactory = {},
        interceptor?: RequestInterceptor
    ) {
        this.serviceName = serviceName

        if (typeof urlOrOptions === 'string') {
            this.transportMode = 'legacy'
            const config = typeof configOrFactory === 'function' ? {} : configOrFactory
            this.http = new HttpRequest(
                {
                    baseURL: urlOrOptions,
                    timeout: 3000,
                    ...config
                },
                interceptor
            )
            return
        }

        this.transportMode = 'session'
        const baseURL = urlOrOptions.baseURL?.trim()
        if (!baseURL) throw new Error(`${serviceName} service requires a baseURL`)
        const factory = typeof configOrFactory === 'function' ? configOrFactory : undefined
        this.http = factory
            ? factory(baseURL, urlOrOptions)
            : new SessionHttpRequest(baseURL, urlOrOptions)
    }

    protected get isSessionMode() {
        return this.transportMode === 'session'
    }

    protected setToken(token: string) {
        this.http.setToken(token)
    }

    protected clearToken() {
        this.http.clearToken()
    }

    protected async health() {
        return getData(this.http.get('/api/health'))
    }
}
