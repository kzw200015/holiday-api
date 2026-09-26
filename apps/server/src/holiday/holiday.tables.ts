import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import { id, timestamps } from "@server/database/columns"

/* date 存 YYYY-MM-DD 字符串：年份即前缀，删整年靠 LIKE 'YYYY-%'，进出接口和数据源也都是这个格式。 */
export const holidayDays = pgTable(
  "holiday_days",
  {
    id: id(),
    name: text().notNull(),
    date: text().notNull(),
    isOffDay: boolean("is_off_day").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("holiday_days_date_key").on(table.date)],
)
