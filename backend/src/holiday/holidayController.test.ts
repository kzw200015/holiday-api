import { type CalendarDate, parseDate } from "@internationalized/date"
import { beforeEach, describe, expect, mock, test } from "bun:test"
import path from "node:path"
import { createApp } from "../app"
import { todayDate } from "../time/localDate"
import type { HolidayDay } from "./holidayModels"

/**
 * 路由与统一响应结构的回归测试，不依赖数据库与远程数据源。
 * 断言直接比对完整 JSON 字符串，响应字段顺序变化会导致测试失败。
 */
describe("HolidayController", () => {
  const query = mock<(date: CalendarDate) => Promise<HolidayDay>>()
  // 指向一个不存在的目录，让所有非 /api 路径都落到 notFound
  const app = createApp({ holidayService: { query }, staticDir: path.join(import.meta.dir, "__no_static__") })

  beforeEach(() => {
    query.mockReset()
  })

  test("日期非法时返回 400", async () => {
    // 2024-02-31 是不存在的日期，同样应被拒绝
    for (const date of ["2024-02-31", "abc"]) {
      const res = await app.request(`/api/holiday/is-holiday?date=${date}`)
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('{"code":400,"data":null,"msg":"日期格式错误，应为 YYYY-MM-DD"}')
    }
    expect(query).not.toHaveBeenCalled()
  })

  test("未匹配的 api 路径返回统一 404", async () => {
    for (const requestPath of ["/api/unknown", "/api"]) {
      const res = await app.request(requestPath)
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('{"code":404,"data":null,"msg":"Not Found"}')
    }
  })

  test("非 api 路径找不到静态资源时返回无响应体的 404", async () => {
    const res = await app.request("/unknown")
    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
  })

  test("date 省略或为空串时取当天", async () => {
    const today = todayDate()
    query.mockResolvedValue({ date: today.toString(), isOffDay: false, name: "" })

    for (const requestPath of ["/api/holiday/is-holiday", "/api/holiday/is-holiday?date="]) {
      const res = await app.request(requestPath)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('{"code":200,"data":false,"msg":"OK"}')
      expect(query).toHaveBeenLastCalledWith(today)
    }
  })

  test("is-holiday 只返回布尔值", async () => {
    query.mockResolvedValue({ date: "2026-01-01", isOffDay: true, name: "元旦" })

    const res = await app.request("/api/holiday/is-holiday?date=2026-01-01")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":true,"msg":"OK"}')
    expect(query).toHaveBeenCalledWith(parseDate("2026-01-01"))
  })

  test("detail 返回日期、是否休息与名称", async () => {
    query.mockResolvedValue({ date: "2026-01-01", isOffDay: true, name: "元旦" })

    const res = await app.request("/api/holiday/detail?date=2026-01-01")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":{"date":"2026-01-01","isOffDay":true,"name":"元旦"},"msg":"OK"}')
  })
})
