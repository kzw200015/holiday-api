import type { Cron } from "croner"

import { createApp, type App } from "@server/app"
import type { Env } from "@server/config"
import { connectDatabase } from "@server/database/connection"
import { HolidayService } from "@server/holiday/holiday.service"
import { HolidaySource } from "@server/holiday/holiday.source"
import { createOutbound, type Outbound } from "@server/outbound"

export interface Server {
  app: App
  /** 每日刷新节假日数据的定时任务 */
  holidayRefresh: Cron
  /** 停掉定时任务与监听，关掉连接池。 */
  close(): Promise<void>
}

/**
 * 按启动顺序装配整个服务，交回还没开始监听的应用：先连库并执行迁移，再刷新节假日数据，最后才建应用、开定时任务。
 * 哪一步失败都把已经打开的连接池关掉再原样抛出。出网默认是真实的，测试换成回放内存响应的替身。
 */
export async function startServer(
  env: Env,
  outbound: Outbound = createOutbound(env.EH_USER_AGENT, env.EH_REQUEST_TIMEOUT),
): Promise<Server> {
  const database = await connectDatabase(env.DATABASE_URL)
  const holidayService = new HolidayService(database, new HolidaySource(outbound))
  try {
    await holidayService.refreshOnStartup()
  } catch (error) {
    await database.$client.close()
    throw error
  }
  const app = createApp({ env, database, outbound, holidayService })
  const holidayRefresh = holidayService.scheduleDailyRefresh()
  return {
    app,
    holidayRefresh,
    async close() {
      holidayRefresh.stop()
      await app.stop()
      await database.$client.close()
    },
  }
}
