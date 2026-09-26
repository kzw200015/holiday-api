import { isCalendarDate } from "@myapi/shared/holiday"
import { z } from "zod"

import { outbound } from "@server/outbound"

/* 节假日安排的数据源：GitHub 上的 holiday-cn 仓库，一年一个 JSON 文件。 */

/** 某一天的节假日安排 */
export interface HolidayDetail {
  /** 查询的日期，格式 YYYY-MM-DD */
  date: string
  /** 是否为休息日 */
  isOffDay: boolean
  /** 节假日名称；为空表示该日期不在节假日安排里（普通工作日或普通周末） */
  name: string
}

const payloadSchema = z.object({
  days: z.array(
    z.object({
      name: z.string(),
      date: z.string().refine(isCalendarDate),
      isOffDay: z.boolean(),
    }),
  ),
})

/** 拉取一整年并校验格式，免得脏数据入库。还没发布时是空列表。 */
export async function fetchYear(year: number): Promise<HolidayDetail[]> {
  const response = await outbound(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`)
  /* 次年的文件要到某个时候才建出来，之前是 404：和「文件有了、安排还没公布」一样，都是还没发布 */
  if (response.status === 404) {
    return []
  }
  if (!response.ok) {
    throw new Error(`拉取 ${year} 年节假日数据失败：HTTP ${response.status}`)
  }
  /* 数据源把 .json 文件按 text/plain 返回，json() 不看 Content-Type，照样能解 */
  const parsed = payloadSchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new Error(`${year} 年节假日数据格式不对：${parsed.error.message}`)
  }
  return parsed.data.days
}
