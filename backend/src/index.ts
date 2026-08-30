import { SQL } from "bun"
import { drizzle } from "drizzle-orm/bun-sql"
import { createApp } from "./app"
import { config } from "./config"
import { createHolidayRemoteClient } from "./holiday/holidayRemoteClient"
import { createHolidayService } from "./holiday/holidayService"
import { currentYear } from "./time/date"

const db = drizzle({ client: new SQL({ url: config.database.url, ...config.database.pool }) })
const holidayService = createHolidayService({ db, holidayRemoteClient: createHolidayRemoteClient() })

// 先刷新当年和下一年的数据再监听端口：两年互不依赖所以并行拉取；
// 任一失败都会以未处理的 rejection 结束进程，容器随之退出
const year = currentYear()
await Promise.all([year, year + 1].map((y) => holidayService.refreshYear(y)))

const app = createApp({ holidayService, staticDir: config.staticDir })
const server = Bun.serve({ port: config.port, fetch: app.fetch })
console.info(`myapi 已启动，监听端口 ${server.port}`)
