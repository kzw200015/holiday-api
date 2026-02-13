import type { AxiosError } from "axios"
import axios from "axios"
import { ElMessage } from "element-plus"

export const HttpClient = axios.create({
  baseURL: "/api",
})

export type ApiResponse<T> = {
  code: number
  data: T
  msg: string
}

type ApiErrorResponse = ApiResponse<unknown>

function resolveErrorMessage(error: AxiosError<ApiErrorResponse>) {
  return error.response?.data.msg || error.message
}

HttpClient.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<ApiErrorResponse>) => {
    const message = resolveErrorMessage(error)
    ElMessage.error(message)
    return Promise.reject(new Error(message))
  },
)
