import { SchedulerRegistry } from "@nestjs/schedule"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { HOLIDAY_REFRESH_JOB } from "@/holiday/holiday.service.js"
import { startApp, type TestApp } from "./support/app.js"
import { createDatabase } from "./support/database.js"
import { holidaySource, json, type Responder } from "./support/outbound.js"

let t: TestApp

beforeAll(async () => {
  t = await startApp(await createDatabase())
})
afterAll(async () => {
  await t?.close()
})
afterEach(() => {
  vi.useRealTimers()
})

async function detail(date?: string) {
  return t.http.get("/api/holiday/detail").query(date === undefined ? {} : { date })
}

describe("休息日查询", () => {
  it("is-holiday 直接回 JSON 布尔值：表内安排优先，否则按周末判断", async () => {
    /* 2026-01-04 是调休上班的周日，2026-01-10 是普通周六，2026-01-07 是普通周三 */
    for (const [date, expected] of [
      ["2026-01-04", false],
      ["2026-01-10", true],
      ["2026-01-07", false],
    ] as const) {
      const response = await t.http.get("/api/holiday/is-holiday").query({ date }).expect(200)
      expect(response.headers["content-type"]).toMatch(/^application\/json/)
      expect(JSON.parse(response.text)).toBe(expected)
    }
  })

  it("detail 回日期、是否休息与节假日名称", async () => {
    expect((await detail("2026-01-01")).body).toEqual({ date: "2026-01-01", isOffDay: true, name: "元旦" })
    expect((await detail("2026-01-10")).body).toEqual({ date: "2026-01-10", isOffDay: true, name: "" })
  })

  it("日期严格按日历校验", async () => {
    for (const date of ["invalid", "2026-02-30", "2026-1-4", "2026-13-01"]) {
      for (const path of ["/api/holiday/detail", "/api/holiday/is-holiday"]) {
        const response = await t.http.get(path).query({ date })
        expect(response.status).toBe(400)
        expect(response.body.message).toEqual(["日期格式错误，应为 YYYY-MM-DD"])
      }
    }
  })

  it("省略日期或传空串时取北京时间的今天，而不是服务器时区的", async () => {
    /* UTC 的 1 月 3 日 16:30 在北京已经是 1 月 4 日 */
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-01-03T16:30:00Z") })
    expect((await detail()).body).toEqual({ date: "2026-01-04", isOffDay: false, name: "元旦" })
    expect((await detail("")).body.date).toBe("2026-01-04")
  })
})

describe("每日刷新", () => {
  async function refreshWith(respond: Responder) {
    t.outbound.respond = respond
    await t.app.get(SchedulerRegistry).getCronJob(HOLIDAY_REFRESH_JOB).fireOnTick()
  }

  it("拉到空的不动库，拉取失败也不动库", async () => {
    await refreshWith((request) =>
      request.url.pathname.endsWith("/2026.json") ? json({ days: [] }) : holidaySource(request),
    )
    expect((await detail("2026-01-01")).body.name).toBe("元旦")

    await refreshWith(() => new Response("bad gateway", { status: 502 }))
    expect((await detail("2026-01-01")).body.name).toBe("元旦")
  })

  it("整年替换：新数据里没有的安排被删掉", async () => {
    await refreshWith((request) =>
      request.url.pathname.endsWith("/2026.json")
        ? json({ days: [{ name: "元旦", date: "2026-01-02", isOffDay: true }] })
        : holidaySource(request),
    )
    expect((await detail("2026-01-02")).body).toEqual({ date: "2026-01-02", isOffDay: true, name: "元旦" })
    /* 调休上班的那个周日不在新数据里了，回到按周末判断 */
    expect((await detail("2026-01-04")).body).toEqual({ date: "2026-01-04", isOffDay: true, name: "" })
  })
})
