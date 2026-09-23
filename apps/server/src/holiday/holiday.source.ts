import type { HolidayDetail } from "@myapi/shared"
import { Inject, Injectable } from "@nestjs/common"
import { z } from "zod"

import { OUTBOUND, type Outbound } from "../outbound/outbound.module.js"

const payloadSchema = z.object({
  days: z.array(
    z.object({
      name: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      isOffDay: z.boolean(),
    }),
  ),
})

/** 节假日安排的数据源：GitHub 上的 holiday-cn 仓库，一年一个 JSON 文件。 */
@Injectable()
export class HolidaySource {
  constructor(@Inject(OUTBOUND) private readonly outbound: Outbound) {}

  /** 拉取一整年并校验格式，免得脏数据入库。还没发布时是空列表。 */
  async fetchYear(year: number): Promise<HolidayDetail[]> {
    const response = await this.outbound(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`)
    /* 次年的文件要到某个时候才建出来，之前是 404：和「文件有了、安排还没公布」一样，都是还没发布 */
    if (response.status === 404) {
      return []
    }
    if (!response.ok) {
      throw new Error(`拉取 ${year} 年节假日数据失败：HTTP ${response.status}`)
    }
    /* 数据源把 .json 文件按 text/plain 返回，所以先取成字符串再按 JSON 解 */
    const parsed = payloadSchema.safeParse(JSON.parse(await response.text()))
    if (!parsed.success) {
      throw new Error(`${year} 年节假日数据格式不对：${parsed.error.message}`)
    }
    return parsed.data.days
  }
}
