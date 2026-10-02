import { app } from "@server/app"
import { closeDatabase, migrateDatabase } from "@server/database"
import * as holidayService from "@server/holiday/holiday-service"

/**
 * 按启动顺序把服务准备好并开始监听，交回监听中的服务器，以及关停。
 * 先执行迁移，再做启动时的节假日刷新，都做完才监听端口；任一步失败原样抛出，进程随之退出。
 */
export async function startServer(listen: { port: number; hostname?: string }) {
  await migrateDatabase()
  await holidayService.refreshOnStartup()
  const server = Bun.serve({ ...listen, fetch: app.fetch })
  holidayService.scheduleDailyRefresh()
  return {
    server,
    /** 停止监听并等在途的请求处理完，同时停下刷新并等进行中的那次做完，两者都结束后关掉连接池。 */
    async close() {
      await Promise.all([server.stop(), holidayService.stopRefreshing()])
      await closeDatabase()
    },
  }
}
