import { boolean, pgTable, text } from "drizzle-orm/pg-core"
import { z } from "zod"
import { isoDateSchema } from "../time/localDate"

/**
 * holiday_days 表结构。只声明代码会读写的三列，表需预先存在（仓库内没有建表脚本）。
 *
 * date 列存 YYYY-MM-DD 字符串，年份即前缀，删旧数据靠 LIKE 'YYYY-%'；
 * 该列有唯一索引 holiday_days_date_key，按日期查询最多命中一行。
 */
export const holidayDays = pgTable("holiday_days", {
  name: text().notNull(),
  date: text().notNull(),
  isOffDay: boolean("is_off_day").notNull(),
})

/**
 * 单日节假日数据：既是表的行结构、远程 JSON 里 days 数组的元素结构，也是查询接口返回的数据
 * （接口返回时 name 为空表示该日期在节假日表中无记录，即普通工作日或普通周末）。
 */
export type HolidayDay = typeof holidayDays.$inferSelect

/**
 * 远程数据源（holiday-cn）单个年份 JSON 的结构，只取 days，其余字段忽略。
 * satisfies 保证元素结构与表的列一致，列改了而这里漏改会在类型检查时报错。
 */
export const holidayYearResponseSchema = z.object({
  days: z.array(
    z.object({
      name: z.string(),
      date: isoDateSchema,
      isOffDay: z.boolean(),
    }) satisfies z.ZodType<HolidayDay>,
  ),
})
