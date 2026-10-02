import { boolean, date, pgTable, text } from "drizzle-orm/pg-core"

/* 节假日安排：一天一行。日期按 YYYY-MM-DD 的字符串进出，与接口、数据源的写法一致。 */
export const holidayDays = pgTable("holiday_days", {
  date: date({ mode: "string" }).primaryKey(),
  isOffDay: boolean("is_off_day").notNull(),
  name: text().notNull(),
})

/** 某一天是不是休息日，也是节假日安排里的一行。name 为空表示这一天不在节假日安排里（普通工作日或普通周末） */
export type HolidayDetail = typeof holidayDays.$inferSelect
