import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { startApp, type TestApp } from "./support/app"
import { createDatabase } from "./support/database"
import { holidaySource, type Responder } from "./support/outbound"

let t: TestApp
let refresh: () => Promise<void>

beforeAll(async () => {
  t = await startApp(await createDatabase())
  ;({ refresh } = await import("@server/holiday/holiday-service"))
})
afterAll(async () => {
  await t?.close()
})
/* 每个测试从同一份数据开始：数据源回放 holidaySource，库里的 2026 年整年换成它的安排 */
beforeEach(async () => {
  t.outbound.respond = holidaySource
  await refreshIn2026()
})
afterEach(() => {
  vi.useRealTimers()
})

/** 按「今年是 2026 年」刷新：数据固定是 2026 年的，不随当前日期变。 */
async function refreshIn2026() {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-06-01T00:00:00Z") })
  try {
    await refresh()
  } finally {
    vi.useRealTimers()
  }
}

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
      expect(JSON.parse(response.text), date).toBe(expected)
    }
  })

  it("detail 回日期、是否休息与节假日名称", async () => {
    expect((await detail("2026-01-01")).body).toEqual({ date: "2026-01-01", isOffDay: true, name: "元旦" })
    expect((await detail("2026-01-10")).body).toEqual({ date: "2026-01-10", isOffDay: true, name: "" })
  })

  it("省略日期或传空串时取北京时间的今天，而不是服务器时区的", async () => {
    /* UTC 的 1 月 3 日 16:30 在北京已经是 1 月 4 日 */
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-01-03T16:30:00Z") })
    expect((await detail()).body).toEqual({ date: "2026-01-04", isOffDay: false, name: "元旦" })
    expect((await detail("")).body.date).toBe("2026-01-04")
  })

  it("日期写错回 400", async () => {
    for (const date of ["2026-1-4", "2026-02-30"]) {
      const response = await detail(date)
      expect(response.status, date).toBe(400)
      expect(response.body, date).toEqual({ code: 400, message: "日期要写成 YYYY-MM-DD，且是真实存在的一天" })
    }
  })
})

describe("刷新", () => {
  /** 数据源的 2026 年换成给定的响应，其余照旧 */
  function serve2026(response: () => Response): Responder {
    return (url) => (url.pathname.endsWith("/2026.json") ? response() : holidaySource(url))
  }

  it("拉到空的不动库，拉取失败也不动库", async () => {
    t.outbound.respond = serve2026(() => Response.json({ days: [] }))
    await refreshIn2026()
    expect((await detail("2026-01-01")).body.name).toBe("元旦")

    t.outbound.respond = serve2026(() => new Response("bad gateway", { status: 502 }))
    await expect(refreshIn2026()).rejects.toThrow("拉取 2026 年节假日数据失败")
    expect((await detail("2026-01-01")).body.name).toBe("元旦")
  })

  it("整年替换：新数据里没有的安排被删掉", async () => {
    t.outbound.respond = serve2026(() =>
      Response.json({ days: [{ name: "元旦", date: "2026-01-02", isOffDay: true }] }),
    )
    await refreshIn2026()
    expect((await detail("2026-01-02")).body).toEqual({ date: "2026-01-02", isOffDay: true, name: "元旦" })
    /* 调休上班的那个周日不在新数据里了，回到按周末判断 */
    expect((await detail("2026-01-04")).body).toEqual({ date: "2026-01-04", isOffDay: true, name: "" })
  })

  it("格式不对的数据不入库", async () => {
    t.outbound.respond = serve2026(() => Response.json({ days: [{ name: "元旦", date: "2026-1-2", isOffDay: true }] }))
    await expect(refreshIn2026()).rejects.toThrow("2026 年节假日数据格式不对")
    expect((await detail("2026-01-01")).body.name).toBe("元旦")
  })
})

it("不存在的路径回 JSON 的 404", async () => {
  const response = await t.http.get("/api/unknown").expect(404)
  expect(response.body).toEqual({ code: 404, message: "这个地址不存在" })
})
