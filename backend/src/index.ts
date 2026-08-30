import { SQL } from "bun"
import { drizzle } from "drizzle-orm/bun-sql"
import { migrate } from "drizzle-orm/bun-sql/migrator"
import { createApp } from "./app"
import { createAuthService } from "./auth/authService"
import { createSessionCookie } from "./auth/sessionCookie"
import { config } from "./config"
import { createSecretBox, deriveSecret } from "./crypto/secretBox"
import { createEhClient } from "./eh/ehClient"
import { createEhRateLimiter } from "./eh/ehRateLimiter"
import { createEhService } from "./eh/ehService"
import { createHolidayRemoteClient } from "./holiday/holidayRemoteClient"
import { createHolidayService } from "./holiday/holidayService"
import { logger } from "./logger"

// 密钥缺失就别启动了：留空意味着任何人都能伪造任意用户的会话，
// 这种问题一旦上线就查不出来，不如在这里直接把容器拦停
if (!config.security.secretKey) {
  throw new Error("缺少 EH_SECRET_KEY 环境变量，用 `openssl rand -hex 32` 生成一个再启动")
}

const db = drizzle({ client: new SQL({ url: config.database.url, ...config.database.pool }) })

// 建表和改表都在这里完成，drizzle/ 下的迁移由 drizzle-kit 从模型生成。
// 放在监听端口之前、且失败即退出：表结构没到位就服务请求，只会把错误推迟到第一个查询。
// drizzle 自己会记录已应用的版本并加锁，重复启动是安全的
await migrate(db, { migrationsFolder: config.database.migrationsDir })
logger.info("数据库迁移已就绪")

const holidayService = createHolidayService({ db, holidayRemoteClient: createHolidayRemoteClient() })
const authService = createAuthService({ db, allowRegistration: config.security.allowRegistration })
const sessionCookie = createSessionCookie({
  secret: deriveSecret(config.security.secretKey, "session-v1"),
  ttlMs: config.security.sessionTtlMs,
  secure: config.security.cookieSecure,
})
const ehService = createEhService({
  db,
  ehClient: createEhClient({
    rateLimiter: createEhRateLimiter(config.eh),
    userAgent: config.eh.userAgent,
    requestTimeoutMs: config.eh.requestTimeoutMs,
  }),
  secretBox: createSecretBox(config.security.secretKey),
  thumbnailKey: deriveSecret(config.security.secretKey, "thumb-v1"),
})

// 先刷新当年和下一年的数据再监听端口：任一失败都会以未处理的 rejection 结束进程，容器随之退出
await holidayService.refreshUpcomingYears()

// 之后按固定间隔重新拉取，跟上数据源的更新（次年安排公布、临时调休）。
// 与启动时不同，这里失败只记日志不退出：库里已有可用数据，等下个周期重试即可
setInterval(() => {
  holidayService.refreshUpcomingYears().catch((err) => logger.error({ err }, "定时刷新节假日数据失败"))
}, config.holiday.refreshIntervalMs)

const app = createApp({
  holidayService,
  authService,
  ehService,
  sessionCookie,
  trustedOrigins: config.security.trustedOrigins,
  staticDir: config.staticDir,
})

// idleTimeout 默认 10 秒，从慢的 H@H 节点流式转发大图时会被掐断，这里放宽到 60 秒
const server = Bun.serve({ port: config.port, idleTimeout: 60, fetch: app.fetch })
logger.info({ port: server.port }, "myapi 已启动")
