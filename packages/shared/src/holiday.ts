import { z } from "zod"

const DATE_RULE = "日期格式错误，应为 YYYY-MM-DD"

/** 严格的日历日期：格式是 YYYY-MM-DD，且这一天真实存在（2026-02-30 不算）。 */
export function isCalendarDate(text: string): boolean {
  const [, yearText, monthText, dayText] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) ?? []
  if (!yearText || !monthText || !dayText) {
    return false
  }
  const [year, month, day] = [Number(yearText), Number(monthText), Number(dayText)]
  /* 不用 Date.UTC：它把 0–99 年当成 1900 年代 */
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** 节假日查询的参数。省略或空串表示北京时间的今天。 */
export const holidayQuerySchema = z.object({
  date: z
    .string({ error: DATE_RULE })
    .refine((date) => date === "" || isCalendarDate(date), DATE_RULE)
    .optional(),
})

/** 某一天的节假日安排 */
export interface HolidayDetail {
  /** 查询的日期，格式 YYYY-MM-DD */
  date: string
  /** 是否为休息日 */
  isOffDay: boolean
  /** 节假日名称；为空表示该日期不在节假日安排里（普通工作日或普通周末） */
  name: string
}
