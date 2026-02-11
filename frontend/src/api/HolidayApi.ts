import { type ApiResponse, HttpClient } from "@/api/HttpClient"

export async function isHoliday(date?: string) {
    const params = date ? { date } : undefined
    const { data } = await HttpClient.get<ApiResponse<boolean>, ApiResponse<boolean>>("/holiday/is-holiday", { params })
    return data
}
