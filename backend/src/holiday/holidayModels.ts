import { bigint, boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { z } from "zod"
import { timestamps } from "../db/timestamps"
import { isoDateSchema } from "../time/date"

/**
 * holiday_days 表结构。
 *
 * date 列存 YYYY-MM-DD 字符串，年份即前缀，删旧数据靠 LIKE 'YYYY-%'；
 * 该列的唯一索引是 holidayService.query 的前提：它只允许命中一行，多行会抛错。
 */
export const holidayDayTable = pgTable(
  "holiday_days",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    name: text().notNull(),
    date: text().notNull(),
    isOffDay: boolean("is_off_day").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("holiday_days_date_key").on(table.date)],
)

/**
 * 单日节假日数据：远程 JSON 里 days 数组的元素结构，也是查询接口返回的数据
 * （接口返回时 name 为空表示该日期在节假日表中无记录，即普通工作日或普通周末）。
 *
 * 从表结构里挑列而不是直接用整行（$inferSelect），是因为这个名字同时承担三种用途，
 * 而 created_at / updated_at 只属于其中一种：
 *   - 远程数据源的 JSON 不会给这两列；
 *   - detail 接口的响应体也不该多出这两列（测试锁了完整 JSON 字符串）；
 *   - 只有「表的一行」该有。
 *
 * 挑列而不是另写一个 interface，好处是列改名时报错点就落在这一行，
 * 而不是散到 holidayService 的调用处再让人回溯。
 */
export type HolidayDay = Pick<typeof holidayDayTable.$inferSelect, "name" | "date" | "isOffDay">

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
