import { afterAll, beforeAll, expect, it } from "vitest"

import { startApp, type TestApp } from "./support/app"
import { createDatabase } from "./support/database"

let t: TestApp

beforeAll(async () => {
  t = await startApp(await createDatabase())
})
afterAll(async () => {
  await t?.close()
})

it("未匹配的路径回 JSON 404；方法不对同样是 404", async () => {
  for (const path of ["/api/unknown", "/api", "/nowhere", "/"]) {
    const response = await t.http.get(path)
    expect(response.status, path).toBe(404)
    expect(response.body).toEqual({ statusCode: 404, message: "这个地址不存在", error: "Not Found" })
  }
  const wrongMethod = await t.http.post("/api/holiday/detail")
  expect(wrongMethod.status).toBe(404)
  expect(wrongMethod.body).toEqual({ statusCode: 404, message: "这个地址不存在", error: "Not Found" })
})
