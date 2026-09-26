import { app } from "@server/app"
import { closeDatabase, migrateDatabase } from "@server/database/connection"
import * as holidayService from "@server/holiday/holiday.service"

/**
 * 按启动顺序把服务准备好，交回还没开始监听的应用、每日刷新节假日数据的定时任务，以及关停（停掉定时任务与监听、关掉连接池）。
 * 先执行迁移，再刷新节假日数据，最后开定时任务。哪一步失败都原样抛出，进程随之退出；
 * 连接池不在这里关，测试里同一份应用失败后还要再启动一次。
 */
export async function startServer() {
  await migrateDatabase()
  await holidayService.refreshOnStartup()
  const holidayRefresh = holidayService.scheduleDailyRefresh()
  return {
    app,
    holidayRefresh,
    async close() {
      holidayRefresh.stop()
      await app.stop()
      await closeDatabase()
    },
  }
}
