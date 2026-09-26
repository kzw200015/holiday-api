import { app } from "@server/app"
import { closeDatabase, migrateDatabase } from "@server/database/connection"
import * as holidayService from "@server/holiday/holiday-service"

/**
 * 按启动顺序把服务准备好并开始监听，交回监听中的服务器、每日刷新节假日数据的定时任务，
 * 以及关停（停掉定时任务、等在途的请求处理完再停止监听、关掉连接池）。
 * 先执行迁移，再刷新节假日数据，然后开定时任务，最后才监听端口。哪一步失败都原样抛出，进程随之退出；
 * 连接池不在这里关，测试里同一份应用失败后还要再启动一次。
 */
export async function startServer(listen: { port: number; hostname?: string }) {
  await migrateDatabase()
  await holidayService.refreshOnStartup()
  const holidayRefresh = holidayService.scheduleDailyRefresh()
  /* Bun 默认 10 秒没有收发就断开连接，手动同步标签译名这类要等十几秒的请求会被掐断 */
  const server = Bun.serve({ ...listen, fetch: app.fetch, idleTimeout: 30 })
  return {
    server,
    holidayRefresh,
    async close() {
      holidayRefresh.stop()
      await server.stop()
      await closeDatabase()
    },
  }
}
