import { validateEnv } from "@server/config"
import { Logger } from "@server/logger"
import { startServer } from "@server/server"

const logger = new Logger("Main")

const env = validateEnv(process.env)
const server = await startServer(env)
server.app.listen(env.PORT)
logger.log(`已开始监听 ${env.PORT} 端口`)

/* 容器停止时收到 SIGTERM：不再接新请求，等在途的请求处理完、关掉连接池再退出 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    logger.log(`收到 ${signal}，正在关停`)
    await server.close()
    process.exit(0)
  })
}
