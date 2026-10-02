import { env } from "@server/config"
import { createLogger } from "@server/logger"
import { startServer } from "@server/server"

const logger = createLogger(import.meta.url)

const server = await startServer({ port: env.PORT })
logger.info(`已开始监听 ${env.PORT} 端口`)

/* 容器停止时收到 SIGTERM：不再接新请求，等在途的请求与刷新做完、关掉连接池再退出 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    logger.info(`收到 ${signal}，正在关停`)
    await server.close()
    process.exit(0)
  })
}
