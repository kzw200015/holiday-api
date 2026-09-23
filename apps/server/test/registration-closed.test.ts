import { afterAll, beforeAll, expect, it } from "vitest"

import { startApp, type TestApp } from "./support/app.js"
import { createDatabase } from "./support/database.js"

/* 注册默认关闭：公网部署时任何人注册即可借这台机器代理 e 站流量。 */
let t: TestApp

beforeAll(async () => {
  t = await startApp(await createDatabase(), { env: { ALLOW_REGISTRATION: "false" } })
})
afterAll(async () => {
  await t?.close()
})

it("关闭注册时登录页据此隐藏入口，注册接口回 400", async () => {
  await t.http.get("/api/auth/options").expect(200, { allowRegistration: false })
  const response = await t.http.post("/api/auth/register").send({ username: "someone", password: "这个密码足够长了" })
  expect([response.status, response.body.message]).toEqual([400, "本站已关闭注册"])
})
