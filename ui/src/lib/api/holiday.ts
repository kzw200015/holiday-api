import type { AxiosError } from "axios"

import { http } from "@/lib/http"

/**
 * 后端通用响应结构：ApiResponse<T>
 */
export type ApiResponse<T> = {
    code: number
    data: T
    msg: string
}

type ApiError = AxiosError<ApiResponse<unknown>>

function resolveApiErrorMessage(error: unknown) {
    if (typeof error === "object" && error) {
        const axiosError = error as ApiError
        const msg = axiosError.response?.data?.msg
        if (msg) {
            return msg
        }
    }
    return error instanceof Error ? error.message : String(error)
}

/**
 * 判断某一天是否为休息日。
 *
 * GET /api/holiday/is-holiday?date=yyyy-MM-dd
 */
export async function queryIsHoliday(date?: string) {
    try {
        const params = date && date.trim().length > 0 ? { date } : undefined
        const response = await http.get<ApiResponse<boolean>>("/holiday/is-holiday", { params })
        return response.data.data
    } catch (error) {
        throw new Error(resolveApiErrorMessage(error))
    }
}

