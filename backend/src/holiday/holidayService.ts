import type { CalendarDate } from "@internationalized/date"
import { isWeekend } from "../time/localDate"
import type { HolidayDayRepository } from "./holidayDayRepository"
import type { HolidayDay } from "./holidayModels"
import type { HolidayRemoteClient } from "./holidayRemoteClient"

/**
 * 节假日业务逻辑。
 */
export class HolidayService {
  constructor(
    private readonly holidayDayRepository: HolidayDayRepository,
    private readonly holidayRemoteClient: HolidayRemoteClient,
  ) {}

  /**
   * 查询指定日期是否为休息日及对应的节假日名称：
   * 先查库，无记录则按周末判断（此时名称为空）。
   * 对象字面量的书写顺序即 JSON 字段顺序（date、isOffDay、name），不要直接返回数据库行。
   */
  async query(date: CalendarDate): Promise<HolidayDay> {
    // CalendarDate.toString() 即 ISO 的 YYYY-MM-DD
    const dateText = date.toString()

    const day = await this.holidayDayRepository.findByDate(dateText)
    if (day) {
      return { date: dateText, isOffDay: day.isOffDay, name: day.name }
    }

    // 无记录，按周末判断
    return { date: dateText, isOffDay: isWeekend(date), name: "" }
  }

  /**
   * 刷新指定年份的节假日数据。
   * 远程拉取放在事务外，避免一次最长 60 秒的 HTTP 调用白占着数据库连接。
   */
  async refreshYear(year: number): Promise<void> {
    const remoteDays = await this.holidayRemoteClient.fetchYearDays(year)
    await this.holidayDayRepository.replaceYear(year, remoteDays)
    console.info(`已刷新 ${year} 年节假日数据，共 ${remoteDays.length} 条`)
  }
}
