import { eq, like } from "drizzle-orm"
import type { BunSQLDatabase } from "drizzle-orm/bun-sql"
import type { IsoDate } from "../time/localDate"
import { holidayDays, type HolidayDay } from "./holidayModels"

/**
 * holiday_days 表的数据访问：查询条件与「年份即 date 列前缀」这类存储约定都收在这一层，
 * 业务层只按领域语义调用。
 */
export class HolidayDayRepository {
  constructor(private readonly db: BunSQLDatabase) {}

  /**
   * 查询指定日期的记录，无记录返回 null。
   *
   * date 列有唯一索引（holiday_days_date_key），最多命中一行，所以多取一行做校验：
   * 真出现多行说明索引被人删了，抛错比静默返回其中一行好。
   */
  async findByDate(date: IsoDate): Promise<HolidayDay | null> {
    const rows = await this.db.select().from(holidayDays).where(eq(holidayDays.date, date)).limit(2)
    if (rows.length > 1) {
      throw new Error(`holiday_days 中 date=${date} 命中多行，唯一索引 holiday_days_date_key 可能已失效`)
    }
    return rows[0] ?? null
  }

  /**
   * 以「先删后插」的方式替换指定年份的数据，整体在一个事务内完成：
   * 回调抛错即回滚，正常返回即提交。插入走单条多行 INSERT，不需要逐条执行。
   */
  async replaceYear(year: number, days: HolidayDay[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(holidayDays).where(like(holidayDays.date, `${year}-%`))
      // Drizzle 不接受空数组的 values()，远程数据为空时只清理旧数据
      if (days.length > 0) {
        await tx.insert(holidayDays).values(days)
      }
    })
  }
}
