import { httpClient } from "@/api/httpClient"

/** 节假日查询结果，与后端 HolidayQueryResult 对齐 */
export interface HolidayDetail {
  /** 查询的日期，格式 YYYY-MM-DD */
  date: string
  /** 是否为休息日 */
  isOffDay: boolean
  /** 节假日名称；为空表示该日期不在节假日表中（普通工作日或普通周末） */
  name: string
}

/** 查询某一天是否为休息日及对应的节假日 */
export function fetchHolidayDetail(date: string, signal?: AbortSignal) {
  return httpClient.get<HolidayDetail>("/holiday/detail", { params: { date }, signal })
}
