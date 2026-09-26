/** 严格的日历日期：格式是 YYYY-MM-DD，且这一天真实存在（2026-02-30 不算）。查询参数与数据源都按它认日期。 */
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
