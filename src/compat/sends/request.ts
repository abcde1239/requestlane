import type { StandardResponse } from './response.js'
import axios, {
    type AxiosRequestConfig,
    type AxiosResponse,
    type InternalAxiosRequestConfig,
    type AxiosInstance,
    type CreateAxiosDefaults
} from 'axios'
import { parseResponse } from './response.js'
import { bearerToken } from '../../request/lifecycle.js'

export type RequestInterceptor = (
    config: InternalAxiosRequestConfig
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>

export class HttpRequest {
    private readonly instance: AxiosInstance

    constructor(config: CreateAxiosDefaults = {}, interceptor?: RequestInterceptor) {
        this.instance = axios.create(config)
        if (interceptor) this.instance.interceptors.request.use(interceptor)
    }

    requestRaw<Data = unknown, Body = unknown>(
        config: AxiosRequestConfig<Body>
    ): Promise<AxiosResponse<Data, Body>> {
        return this.instance.request<Data, AxiosResponse<Data, Body>, Body>(config)
    }

    async request<Data = unknown, Body = unknown>(
        config: AxiosRequestConfig<Body>
    ): Promise<StandardResponse<Data>> {
        const response = await this.requestRaw<unknown, Body>(config)
        return parseResponse<Data>(response.data)
    }

    get<Data = unknown>(url: string, config?: AxiosRequestConfig): Promise<StandardResponse<Data>> {
        return this.request<Data>({ ...config, method: 'GET', url })
    }

    post<Body = unknown, Data = unknown>(
        url: string,
        data?: Body,
        config?: AxiosRequestConfig<Body>
    ): Promise<StandardResponse<Data>> {
        return this.request<Data, Body>({ ...config, method: 'POST', url, data })
    }

    delete<Data = unknown>(
        url: string,
        config?: AxiosRequestConfig
    ): Promise<StandardResponse<Data>> {
        return this.request<Data>({ ...config, method: 'DELETE', url })
    }

    patch<Body = unknown, Data = unknown>(
        url: string,
        data?: Body,
        config?: AxiosRequestConfig<Body>
    ): Promise<StandardResponse<Data>> {
        return this.request<Data, Body>({ ...config, method: 'PATCH', url, data })
    }

    setToken(token: string) {
        const headers = this.instance.defaults.headers
        const normalized = bearerToken(token)
        const groups = [
            headers,
            ...['common', 'get', 'post', 'put', 'patch', 'delete', 'head', 'options'].map(
                (method) => headers[method]
            )
        ]
        for (const group of groups) {
            if (!group || typeof group !== 'object') continue
            for (const key of Object.keys(group)) {
                if (key.toLowerCase() === 'authorization') Reflect.deleteProperty(group, key)
            }
        }
        if (normalized) headers.common.Authorization = normalized
    }

    clearToken() {
        this.setToken('')
    }
}
