import type { Cron } from "croner"
import request from "supertest"
import type TestAgent from "supertest/lib/agent.js"

import type { App } from "@server/app"
import { FakeOutbound, withHolidays } from "./outbound"
import { present } from "./present"

export const SECRET_KEY = "test-secret-test-secret-test-secret"

export interface TestApp {
  app: App
  http: TestAgent
  outbound: FakeOutbound
  holidayRefresh: Cron
  close(): Promise<void>
}

/**
 * 起一份完整的应用：只有数据库（Testcontainers 里的一个库）与出网（假的外部网站）是换过的。
 *
 * 配置在应用的模块被导入时就读定了，所以先写好环境变量、换掉出网，再导入应用；同一个测试文件里的环境变量要一致，
 * 需要另一套配置的放进另一个文件（每个测试文件各在一个进程里跑）。
 * 出网默认只回节假日数据源，其余请求由测试自己给 outbound.respond（用 withHolidays 包一层）。
 */
export async function startApp(
  databaseUrl: string,
  {
    env = {},
    outbound = new FakeOutbound(withHolidays()),
  }: { env?: Record<string, string>; outbound?: FakeOutbound } = {},
): Promise<TestApp> {
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    SECRET_KEY,
    ALLOW_REGISTRATION: "true",
    TOKEN_TTL: "30d",
    EH_USER_AGENT: "test-agent",
    EH_REQUEST_TIMEOUT: "30s",
    ATTACHMENT_TTL: "24h",
    ...env,
  })
  const { replaceOutbound } = await import("@server/outbound")
  replaceOutbound(outbound.fetch)
  const { startServer } = await import("@server/server")
  const { app, holidayRefresh, close } = await startServer()
  /* 只听 127.0.0.1 的随机端口，按同一个地址发请求：听 :: 而连 127.0.0.1 的话，macOS 上别的进程能单独占住同一端口的 127.0.0.1 */
  app.listen({ port: 0, hostname: "127.0.0.1" })
  const port = present(app.server?.port, "应用监听的端口")
  return { app, http: request(`http://127.0.0.1:${port}`), outbound, holidayRefresh, close }
}

/** 注册一个新账号，交回它的令牌与带上令牌的请求头。 */
export async function register(http: TestAgent, username = `user_${Math.random().toString(36).slice(2, 12)}`) {
  const response = await http.post("/api/auth/register").send({ username, password: "这个密码足够长了" }).expect(200)
  const token = response.body.token as string
  return { token, auth: { Authorization: `Bearer ${token}` }, userId: response.body.user.id as number, username }
}
