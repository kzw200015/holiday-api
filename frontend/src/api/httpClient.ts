import type { ApiResponse } from "@myapi/shared/apiResponse"
import type { AxiosError } from "axios"
import axios from "axios"
import { ElMessage } from "element-plus"

export type { ApiResponse }

export const HttpClient = axios.create({
  baseURL: "/api",
})

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
