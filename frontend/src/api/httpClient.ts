import type { ApiResponse } from "@/types/apiResponse"
import type { AxiosError, AxiosRequestConfig } from "axios"
import axios from "axios"

export type { ApiResponse }

/** 接口前缀。绕开 axios 直接拼地址的地方（比如给 img 的 src）也从这里取，别再写死一份 */
export const API_BASE = "/api"

const instance = axios.create({
  baseURL: API_BASE,
})

type ApiErrorResponse = ApiResponse<unknown>

function resolveErrorMessage(error: AxiosError<ApiErrorResponse>) {
  return error.response?.data.msg || error.message
}

/*
 * 会话失效时的去处。由 main.ts 注入而不是这里直接 import router：
 * router 会加载各个页面，页面又会 import 本文件，直接依赖就成环了
 */
let handleUnauthorized: (() => void) | undefined

export function onUnauthorized(handler: () => void) {
  handleUnauthorized = handler
}

instance.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.status === 401) {
      handleUnauthorized?.()
    }
    return Promise.reject(new Error(resolveErrorMessage(error)))
  },
)

/**
 * 取出可以直接显示给用户的报错文案。
 *
 * 上面的拦截器保证 reject 出来的一定是携带后端 msg 的 Error，所以正常路径永远走第一个分支；
 * fallback 是给「try 块里混进了别的异常」兜底的。这条约定放在这里而不是让每个页面各写一遍，
 * 是因为它属于本文件的契约，改了拦截器就该改这里。
 */
export function errorText(error: unknown, fallback = "操作失败"): string {
  return error instanceof Error ? error.message : fallback
}

/** 类型安全的 HTTP 客户端，利用 axios 泛型重载声明拦截器解包后的返回类型 */
export const HttpClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return instance.get<unknown, ApiResponse<T>>(url, config)
  },

  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return instance.post<unknown, ApiResponse<T>>(url, data, config)
  },
}
