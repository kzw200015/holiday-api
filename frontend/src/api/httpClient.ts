import type { ApiResponse } from "@myapi/shared/apiResponse"
import type { AxiosError, AxiosRequestConfig } from "axios"
import axios from "axios"
import { ElMessage } from "element-plus"

export type { ApiResponse }

const instance = axios.create({
  baseURL: "/api",
})

type ApiErrorResponse = ApiResponse<unknown>

function resolveErrorMessage(error: AxiosError<ApiErrorResponse>) {
  return error.response?.data.msg || error.message
}

instance.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<ApiErrorResponse>) => {
    const message = resolveErrorMessage(error)
    ElMessage.error(message)
    return Promise.reject(new Error(message))
  },
)

/** 类型安全的 HTTP 客户端，利用 axios 泛型重载声明拦截器解包后的返回类型 */
export const HttpClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return instance.get<unknown, ApiResponse<T>>(url, config)
  },

  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return instance.post<unknown, ApiResponse<T>>(url, data, config)
  },
}
