import { afterAll, beforeAll, expect, inject, it } from "vitest"

import { startApp, type TestApp } from "./support/app"
import { createDatabase, sql } from "./support/database"

/* 要把这个文件的库删掉，单独一个文件，不影响别的测试 */
let t: TestApp
let databaseUrl: string

beforeAll(async () => {
  databaseUrl = await createDatabase()
  t = await startApp(databaseUrl)
})
afterAll(async () => {
  await t?.close()
})

/** 两个探针的状态码 */
async function probe() {
  const [live, ready] = await Promise.all([t.http.get("/api/health/live"), t.http.get("/api/health/ready")])
  return { live: live.status, ready: ready.status }
}

it("数据库连不上时 ready 回 503，live 照旧回 200", async () => {
  expect(await probe()).toEqual({ live: 200, ready: 200 })

  /* 强制断开连接池里的连接再删库，之后重连都会失败 */
  const name = new URL(databaseUrl).pathname.slice(1)
  await sql(inject("postgresUrl"), `DROP DATABASE ${name} WITH (FORCE)`)

  expect(await probe()).toEqual({ live: 200, ready: 503 })
})
