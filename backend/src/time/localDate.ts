import { type CalendarDate, getLocalTimeZone, isWeekend as isWeekendDate, parseDate, today } from "@internationalized/date"
import { z } from "zod"

/**
 * 日期的两种表示及各自的适用范围：
 *
 * - `IsoDate`：`YYYY-MM-DD` 字符串，用于数据库 date 列（年份即前缀）和接口出入参。
 * - `CalendarDate`（@internationalized/date）：只有年月日、没有时分秒和时区，等价于原来的
 *   java.time.LocalDate，前端日历组件（reka-ui）用的也是它。HTTP 入口校验时一次性解析成它，
 *   业务层按对象传递，落库或写进响应体时再 `toString()` 转回 IsoDate，避免同一个日期被解析多次。
 */
export type IsoDate = string

/** 周末按哪个地区的习惯判断（周六、周日）。 */
const WEEKEND_LOCALE = "zh-CN"

/**
 * IsoDate 的校验规则，所有数据入口（HTTP 参数、远程 JSON）共用这一条：
 * 位数严格（拒绝 2024-1-1、20240101），且日历上存在（拒绝 2024-02-31、2023-02-29）。
 */
export const isoDateSchema = z.iso.date()

/**
 * 校验并解析成 CalendarDate，供需要做日历运算的入口使用。
 * 解析只能走 parseDate：直接 new CalendarDate(2024, 2, 31) 会被静默钳成 2 月 29 日。
 */
export const calendarDateSchema = isoDateSchema.transform((text) => parseDate(text))

/** 当天日期，按进程时区计算（容器内由 TZ 环境变量决定）。 */
export function todayDate(): CalendarDate {
  return today(getLocalTimeZone())
}

/** 当前年份，与 [todayDate] 用同一个时区来源。 */
export function currentYear(): number {
  return todayDate().year
}

/** 是否为周六或周日。 */
export function isWeekend(date: CalendarDate): boolean {
  return isWeekendDate(date, WEEKEND_LOCALE)
}
