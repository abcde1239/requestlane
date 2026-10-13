export type Method =
  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type ResponseType = 'json' | 'text' | 'blob' | 'arraybuffer'
export type Scope = string | number
// 用于递归转换数据为只读
export type ReadonlyData<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: ReadonlyData<T[K]> }
    : T extends Record<string, unknown>
      ? { readonly [K in keyof T]: ReadonlyData<T[K]> }
      : T extends object
        ? { readonly [K in keyof T]: ReadonlyData<T[K]> }
        : T
