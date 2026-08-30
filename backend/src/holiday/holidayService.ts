import type { CalendarDate } from "@internationalized/date"
import { eq, like } from "drizzle-orm"
import type { BunSQLDatabase } from "drizzle-orm/bun-sql"
import { logger } from "../logger"
import { currentYear, type IsoDate, isWeekend } from "../time/date"
import { holidayDayTable, type HolidayDay } from "./holidayModels"
import type { HolidayRemoteClient } from "./holidayRemoteClient"

export type HolidayService = ReturnType<typeof createHolidayService>

/**
 * 节假日业务逻辑，直接操作 holiday_days 表：
 * 查询条件与「年份即 date 列前缀」这类存储约定都写在这里，没有单独的数据访问层。
 */
export function createHolidayService({
  db,
  holidayRemoteClient,
}: {
  db: BunSQLDatabase
  holidayRemoteClient: HolidayRemoteClient
}) {
  return {
    /**
     * 查询指定日期是否为休息日及对应的节假日名称：
     * 先查库，无记录则按周末判断（此时名称为空）。
     */
    async query(date: CalendarDate): Promise<HolidayDay> {
      // CalendarDate.toString() 即 ISO 的 YYYY-MM-DD
      const dateText: IsoDate = date.toString()

      // date 列有唯一索引（holiday_days_date_key），最多命中一行，所以多取一行做校验：
      // 真出现多行说明索引被人删了，抛错比静默返回其中一行好
      const rows = await db.select().from(holidayDayTable).where(eq(holidayDayTable.date, dateText)).limit(2)
      if (rows.length > 1) {
        throw new Error(`holiday_days 中 date=${dateText} 命中多行，唯一索引 holiday_days_date_key 可能已失效`)
      }

      // 对象字面量的书写顺序即 JSON 字段顺序（date、isOffDay、name），不要直接返回数据库行
      const day = rows[0]
      if (day) {
        return { date: dateText, isOffDay: day.isOffDay, name: day.name }
      }

      // 无记录，按周末判断
      return { date: dateText, isOffDay: isWeekend(date), name: "" }
    },

    refreshYear,

    /**
     * 刷新当年和次年的数据：两年互不依赖所以并行拉取，任一失败即整体 reject（另一年仍会跑完）。
     * 年份在每次调用时重新计算，跨年后定时刷新会自动带上新的次年。
     */
    async refreshUpcomingYears(): Promise<void> {
      const year = currentYear()
      await Promise.all([year, year + 1].map(refreshYear))
    },
  }

  /** 刷新指定年份的节假日数据：远程拉取后以「先删后插」替换该年数据。 */
  async function refreshYear(year: number): Promise<void> {
    // 远程拉取放在事务外，避免一次最长 60 秒的 HTTP 调用白占着数据库连接
    const remoteDays = await holidayRemoteClient.fetchYearDays(year)
    // 删和插在一个事务内完成，回调抛错即回滚，正常返回即提交。插入走单条多行 INSERT，不需要逐条执行
    await db.transaction(async (tx) => {
      await tx.delete(holidayDayTable).where(like(holidayDayTable.date, `${year}-%`))
      // Drizzle 不接受空数组的 values()，远程数据为空时只清理旧数据
      if (remoteDays.length > 0) {
        await tx.insert(holidayDayTable).values(remoteDays)
      }
    })
    logger.info({ year, count: remoteDays.length }, "已刷新节假日数据")
  }
}
