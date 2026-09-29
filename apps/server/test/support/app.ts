import request from "supertest"
import type TestAgent from "supertest/lib/agent.js"

import type { startServer } from "@server/server"
import { FakeOutbound, holidaySource } from "./outbound"
import { present } from "./present"

export interface TestApp extends Awaited<ReturnType<typeof startServer>> {
  http: TestAgent
  outbound: FakeOutbound
}

/**
 * 起一份完整的应用：只有数据库（Testcontainers 里的一个库）与出网（假的外部网站）是换过的。
 *
 * 配置在应用的模块被导入时就读定了，所以先写好环境变量、换掉出网，再导入应用；同一个测试文件里的环境变量要一致，
 * 需要另一套配置的放进另一个文件（每个测试文件各在一个进程里跑）。
 * 出网默认回放节假日数据源，测试要别的响应就换掉 outbound.respond。
 */
export async function startApp(
  databaseUrl: string,
  {
    env = {},
    outbound = new FakeOutbound(holidaySource),
  }: { env?: Record<string, string>; outbound?: FakeOutbound } = {},
): Promise<TestApp> {
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    EH_USER_AGENT: "test-agent",
    EH_REQUEST_TIMEOUT: "30s",
    ...env,
  })
  const { replaceOutbound } = await import("@server/outbound")
  replaceOutbound(outbound.fetch)
  const server = await import("@server/server")
  /* 只听 127.0.0.1 的随机端口，按同一个地址发请求：听 :: 而连 127.0.0.1 的话，macOS 上别的进程能单独占住同一端口的 127.0.0.1 */
  const started = await server.startServer({ port: 0, hostname: "127.0.0.1" })
  const port = present(started.server.port, "应用监听的端口")
  return { ...started, http: request(`http://127.0.0.1:${port}`), outbound }
}
