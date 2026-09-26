import { api, request } from "@/shared/api/httpClient"

/** 查询某一天是否为休息日及对应的节假日 */
export function fetchHolidayDetail(date: string, signal?: AbortSignal) {
  return request(api.holiday.detail.get({ query: { date }, fetch: { signal } }))
}
