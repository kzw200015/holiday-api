import { parseDate } from "@internationalized/date"
import { describe, expect, test } from "bun:test"
import { calendarDateSchema, isoDateSchema, isWeekend, todayDate } from "./localDate"

describe("localDate", () => {
  test("只接受位数完整且日历上存在的 YYYY-MM-DD", () => {
    expect(isoDateSchema.safeParse("2024-02-29").success).toBe(true)
    expect(isoDateSchema.safeParse("2026-01-01").success).toBe(true)
    // 位数不足、不存在的日期、无横线写法都要拒绝，保持与原接口契约一致
    for (const text of ["2024-1-1", "2024-02-31", "2023-02-29", "20240101", "2024-01-01x", "abc", ""]) {
      expect(isoDateSchema.safeParse(text).success).toBe(false)
    }
  })

  test("calendarDateSchema 解析成 CalendarDate 且往返一致", () => {
    const parsed = calendarDateSchema.parse("2026-01-01")
    expect(parsed).toEqual(parseDate("2026-01-01"))
    expect(parsed.toString()).toBe("2026-01-01")
    expect(calendarDateSchema.safeParse("2024-02-31").success).toBe(false)
  })

  test("按周六、周日判断周末", () => {
    expect(isWeekend(parseDate("2026-08-29"))).toBe(true) // 周六
    expect(isWeekend(parseDate("2026-08-30"))).toBe(true) // 周日
    expect(isWeekend(parseDate("2026-08-31"))).toBe(false) // 周一
  })

  test("当天日期转成字符串为 YYYY-MM-DD 格式", () => {
    expect(isoDateSchema.safeParse(todayDate().toString()).success).toBe(true)
  })
})
