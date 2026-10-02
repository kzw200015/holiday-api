import { z } from "zod"

import type { HolidayDetail } from "@server/holiday/holiday-tables"
import { outbound } from "@server/outbound"

/* 节假日安排的数据源：GitHub 上的 holiday-cn 仓库，一年一个 JSON 文件。 */

const SOURCE = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master"

/* 一年的文件是 `{"days": [...]}`，其余字段用不上，不收 */
const payloadSchema = z.object({
  days: z.array(z.object({ name: z.string(), date: z.iso.date(), isOffDay: z.boolean() })),
})

/** 拉取一整年并校验格式，免得脏数据入库。还没发布时是空列表。 */
export async function fetchYear(year: number): Promise<HolidayDetail[]> {
  let payload: unknown
  try {
    const response = await outbound(`${SOURCE}/${year}.json`)
    /* 次年的文件要到某个时候才建出来，之前是 404：和「文件有了、安排还没公布」一样，都是还没发布 */
    if (response.status === 404) {
      return []
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    /* 数据源把 .json 文件按 text/plain 返回，json() 不看 Content-Type，照样能解 */
    payload = await response.json()
  } catch (error) {
    throw new Error(`拉取 ${year} 年节假日数据失败`, { cause: error })
  }
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error(`${year} 年节假日数据格式不对`, { cause: parsed.error })
  }
  return parsed.data.days
}
