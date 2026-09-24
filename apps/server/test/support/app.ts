import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import type TestAgent from "supertest/lib/agent.js"

import { OUTBOUND } from "@/outbound/outbound.module"
import { FakeOutbound, withHolidays } from "./outbound"

export const SECRET_KEY = "test-secret-test-secret-test-secret"

export interface TestApp {
  app: INestApplication
  http: TestAgent
  outbound: FakeOutbound
  close(): Promise<void>
}

/**
 * 起一份完整的应用：只有数据库（Testcontainers 里的一个库）与出网（假的外部网站）是换过的。
 *
 * 配置在应用模块被导入时就读定了，所以同一个测试文件里的环境变量要一致；需要另一套配置的放进另一个文件。
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
  const { AppModule } = await import("@/app.module")
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OUTBOUND)
    .useValue(outbound.fetch)
    .compile()
  const app = moduleRef.createNestApplication()
  /*
   * 显式监听 127.0.0.1 再按这个地址发请求。交给 supertest 自己监听的话，它听的是 IPv6 的 ::、连的却是 127.0.0.1，
   * macOS 上别的进程能在同一个端口单独占住 127.0.0.1，请求偶尔就落到别人那里去了。
   */
  await app.listen(0, "127.0.0.1")
  return { app, http: request(await app.getUrl()), outbound, close: () => app.close() }
}

/** 注册一个新账号，交回它的令牌与带上令牌的请求头。 */
export async function register(http: TestAgent, username = `user_${Math.random().toString(36).slice(2, 12)}`) {
  const response = await http.post("/api/auth/register").send({ username, password: "这个密码足够长了" }).expect(201)
  const token = response.body.token as string
  return { token, auth: { Authorization: `Bearer ${token}` }, userId: response.body.user.id as number, username }
}
