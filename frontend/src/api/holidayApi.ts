import type { NextOffDayResult } from "@packages/types/holiday"
import { HttpClient } from "@/api/httpClient"

export type { NextOffDayResult }

export async function isHoliday(date?: string) {
  const { data } = await HttpClient.get<boolean>("/holiday/is-holiday", { params: { date } })
  return data
}

export async function queryNextOffDay(date?: string) {
  const { data } = await HttpClient.get<NextOffDayResult>("/holiday/next-off-day", { params: { date } })
  return data
}
