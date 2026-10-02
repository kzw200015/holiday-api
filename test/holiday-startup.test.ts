import { afterEach, expect, it, vi } from "vitest"

import { startApp, type TestApp } from "./support/app"
import { createDatabase, sql } from "./support/database"

let t: TestApp | undefined

afterEach(async () => {
  vi.useRealTimers()
  await t?.close()
  t = undefined
})

/*
 * 启动时刷新节假日数据：数据源在 GitHub 上，偶尔连不上，库里已经有今年的安排就照常启动；
 * 连今年的都没有才拒绝启动，免得接口带着空表一直按周末规则回错误答案。
 */
it("数据源连不上时，库里没有今年的安排就拒绝启动，有就照常启动", async () => {
  const databaseUrl = await createDatabase()
  const unreachable = () => Promise.reject(new TypeError("fetch failed"))
  /* 「今年」固定是 2026 年 */
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-06-01T00:00:00Z") })

  await expect(startApp(databaseUrl, { respond: unreachable })).rejects.toThrow("库里没有今年的节假日安排")

  await sql(databaseUrl, "INSERT INTO holiday_days (date, is_off_day, name) VALUES ('2026-01-01', true, '元旦')")
  t = await startApp(databaseUrl, { respond: unreachable })
  const response = await t.http.get("/api/holiday/detail").query({ date: "2026-01-01" }).expect(200)
  expect(response.body.name).toBe("元旦")
})
