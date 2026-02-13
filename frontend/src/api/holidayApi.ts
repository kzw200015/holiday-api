import { type ApiResponse, HttpClient } from "@/api/httpClient.ts"

export type NextOffDayResult = {
  nextOffDayDate: string
  daysToNextOffDay: number
}

export async function isHoliday(date?: string) {
  const params = date ? { date } : undefined
  const { data } = await HttpClient.get<ApiResponse<boolean>, ApiResponse<boolean>>("/holiday/is-holiday", { params })
  return data
}

export async function queryNextOffDay(date?: string) {
  const params = date ? { date } : undefined
  const { data } = await HttpClient.get<ApiResponse<NextOffDayResult>, ApiResponse<NextOffDayResult>>("/holiday/next-off-day", { params })
  return data
}
