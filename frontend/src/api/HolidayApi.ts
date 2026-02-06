import type { AxiosError } from "axios"

import { HttpClient } from "@/api/HttpClient"

export type ApiResponse<T> = {
    code: number
    data: T
    msg: string
}

type ApiError = AxiosError<ApiResponse<unknown>>

function resolveApiErrorMessage(error: unknown) {
    if (typeof error === "object" && error) {
        const axiosError = error as ApiError
        const message = axiosError.response?.data?.msg
        if (message) {
            return message
        }
    }

    return error instanceof Error ? error.message : String(error)
}

export async function queryIsHoliday(date?: string) {
    try {
        const params = date ? { date } : undefined
        const response = await HttpClient.get<ApiResponse<boolean>>("/holiday/is-holiday", { params })
        return response.data.data
    } catch (error) {
        throw new Error(resolveApiErrorMessage(error))
    }
}
