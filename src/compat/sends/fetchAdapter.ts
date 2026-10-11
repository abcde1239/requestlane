import axios, { type AxiosAdapter } from 'axios'
// 在一些情况能用
export function fetchAdapter(fetcher: typeof fetch): AxiosAdapter {
    return async (config) => {
        const headers = config.headers.toJSON() as Record<string, string>
        if (headers.Accept === 'application/json, text/plain, */*')
            // 删除防后续axios默认生成
            delete headers.Accept
        const response = await fetcher(axios.getUri(config), {
            method: config.method?.toUpperCase(),
            headers,
            body: config.data,
            signal: config.signal as AbortSignal,
            cache: 'no-store'
        })
        const text = await response.text()
        let data: unknown = text
        if (text) {
            try {
                data = JSON.parse(text)
            } catch {}
        } else {
            data = null
        }
        return {
            data,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            config
        }
    }
}
