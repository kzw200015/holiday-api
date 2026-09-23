import type { HolidayDetail } from "@myapi/shared"

import { httpClient } from "@/shared/api/httpClient"

/** 查询某一天是否为休息日及对应的节假日 */
export function fetchHolidayDetail(date: string, signal?: AbortSignal) {
  return httpClient.get<HolidayDetail>("/holiday/detail", { params: { date }, signal })
}
