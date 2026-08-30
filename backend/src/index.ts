import { SQL } from "bun"
import { drizzle } from "drizzle-orm/bun-sql"
import { createApp } from "./app"
import { config } from "./config"
import { createHolidayRemoteClient } from "./holiday/holidayRemoteClient"
import { createHolidayService } from "./holiday/holidayService"

const db = drizzle({ client: new SQL({ url: config.database.url, ...config.database.pool }) })
const holidayService = createHolidayService({ db, holidayRemoteClient: createHolidayRemoteClient() })

// 先刷新当年和下一年的数据再监听端口：任一失败都会以未处理的 rejection 结束进程，容器随之退出
await holidayService.refreshUpcomingYears()

// 之后按固定间隔重新拉取，跟上数据源的更新（次年安排公布、临时调休）。
// 与启动时不同，这里失败只记日志不退出：库里已有可用数据，等下个周期重试即可
setInterval(() => {
  holidayService.refreshUpcomingYears().catch((err) => console.error("定时刷新节假日数据失败", err))
}, config.holiday.refreshIntervalMs)

const app = createApp({ holidayService, staticDir: config.staticDir })
const server = Bun.serve({ port: config.port, fetch: app.fetch })
console.info(`myapi 已启动，监听端口 ${server.port}`)
