import { afterEach, expect, it } from "vitest"

import { startApp, type TestApp } from "./support/app.js"
import { createDatabase, sql } from "./support/database.js"
import { FakeOutbound } from "./support/outbound.js"

let t: TestApp | undefined

afterEach(async () => {
  await t?.close()
  t = undefined
})

/*
 * 启动时刷新节假日数据：数据源在 GitHub 上，偶尔连不上，库里已经有今年的安排就照常启动；
 * 连今年的都没有才拒绝启动，免得接口带着空表一直按周末规则回错误答案。
 */
it("数据源连不上时，库里没有今年的安排就拒绝启动，有就照常启动", async () => {
  const databaseUrl = await createDatabase()
  const unreachable = () => new FakeOutbound(() => Promise.reject(new TypeError("fetch failed")))

  await expect(startApp(databaseUrl, { outbound: unreachable() })).rejects.toThrow("fetch failed")

  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()).slice(0, 4)
  await sql(databaseUrl, "INSERT INTO holiday_days (name, date, is_off_day) VALUES ('元旦', $1, true)", [
    `${year}-01-01`,
  ])
  t = await startApp(databaseUrl, { outbound: unreachable() })
  const response = await t.http
    .get("/api/holiday/detail")
    .query({ date: `${year}-01-01` })
    .expect(200)
  expect(response.body.name).toBe("元旦")
})
