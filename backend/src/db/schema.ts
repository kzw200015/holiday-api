import { pgTable, serial, text, boolean } from "drizzle-orm/pg-core"

/** holiday_days 表定义，对应已有的 PostgreSQL 表 */
export const holidayDays = pgTable("holiday_days", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  isOffDay: boolean("is_off_day").notNull(),
})
