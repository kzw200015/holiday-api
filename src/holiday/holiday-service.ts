import { Cron } from "croner"
import { and, eq, gte, lt } from "drizzle-orm"

import { database } from "@server/database"
import * as holidaySource from "@server/holiday/holiday-source"
import { holidayDays, type HolidayDetail } from "@server/holiday/holiday-tables"
import { createLogger } from "@server/logger"

/*
 * 休息日查询：节假日安排里有的按安排，没有的按周末判断。
 * 以及安排的刷新：启动时一次，之后每天北京时间 4:30 一次，每次拉当年和次年。
 */

const logger = createLogger(import.meta.url)

/** 节假日安排是中国的：「今天」「今年」一律按北京时间算，不跟着服务器的时区走（容器默认是 UTC）。 */
const CHINA_ZONE = "Asia/Shanghai"

/* en-CA 的日期格式恰好是 YYYY-MM-DD */
const CHINA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: CHINA_ZONE })

/** 进行中的那次刷新：同一时刻的几次合成一次（如启动时放到后台的那次撞上定时的），关停时等它做完再关连接池。 */
let refreshing: Promise<void> | undefined

/** 每天定时刷新的任务，关停时停下。 */
let daily: Cron | undefined

/** 表中没有安排的日期按周末判断，此时名称为空。省略日期时查北京时间的今天。 */
export async function query(date = chinaToday()): Promise<HolidayDetail> {
  const [day] = await database.select().from(holidayDays).where(eq(holidayDays.date, date))
  if (day) {
    return day
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return { date, isOffDay: weekday === 0 || weekday === 6, name: "" }
}

/**
 * 启动时的那次刷新，它做完服务才开始监听。
 *
 * 库里已经有今年的安排就放到后台去拉，不拖慢启动，拉不到只记日志——数据源在 GitHub 上，偶尔又慢又连不上，不该因此起不来。
 * 连今年的都没有才当场拉完，拉不到就拒绝启动，免得接口带着空表一直按周末规则回错误答案。
 */
export async function refreshOnStartup() {
  if (await hasYear(currentYear())) {
    refresh().catch((error: unknown) => logger.error(error, "启动时刷新节假日数据失败，先用库里已有的数据"))
    return
  }
  try {
    await refresh()
  } catch (error) {
    throw new Error("库里没有今年的节假日安排，启动时又没拉到", { cause: error })
  }
}

/** 每天北京时间 4:30 刷新一次：数据源一年只更新几次（次年安排公布、临时调休），每天拉一次足够。失败只记日志，第二天再试。 */
export function scheduleDailyRefresh() {
  daily = new Cron("0 30 4 * * *", { timezone: CHINA_ZONE }, async () => {
    try {
      await refresh()
    } catch (error) {
      logger.error(error, "定时刷新节假日数据失败")
    }
  })
}

/** 关停时调：不再定时刷新，并等进行中的那次（不管是谁发起的）做完。 */
export async function stopRefreshing() {
  daily?.stop()
  /* 失败由发起它的一方记日志，这里只等它结束 */
  await refreshing?.catch(() => undefined)
}

/** 刷新当年和次年。年份每次重新算，跨年后自然带上新的次年；两年互不依赖所以并行，任一失败即整体失败。 */
export function refresh(): Promise<void> {
  refreshing ??= Promise.all([refreshYear(currentYear()), refreshYear(currentYear() + 1)])
    .then(() => undefined)
    .finally(() => {
      refreshing = undefined
    })
  return refreshing
}

/** 北京时间的今天，YYYY-MM-DD。 */
function chinaToday(): string {
  return CHINA_DATE.format(new Date())
}

async function hasYear(year: number): Promise<boolean> {
  const rows = await database.select({ date: holidayDays.date }).from(holidayDays).where(inYear(year)).limit(1)
  return rows.length > 0
}

function currentYear(): number {
  return Number(chinaToday().slice(0, 4))
}

/** 以「先删后插」替换一整年。 */
async function refreshYear(year: number) {
  /* 拉取放在事务外，免得一次慢请求白占着数据库连接 */
  const days = await holidaySource.fetchYear(year)
  /*
   * 拉到空的就不动库：一年的安排公布之后不会变回没有，拉到空的只能是还没发布，
   * 或者数据源出了岔子（路径变了、全回 404），这时先删后插只会把已有的安排清掉
   */
  if (days.length === 0) {
    logger.info(`${year} 年的节假日安排还没有发布`)
    return
  }
  /* 删和插在一个事务里：中途出错即回滚，不会留下「旧的没了、新的也没进来」的空年份 */
  await database.transaction(async (tx) => {
    await tx.delete(holidayDays).where(inYear(year))
    await tx.insert(holidayDays).values(days)
  })
  logger.info(`已刷新 ${year} 年的节假日安排，共 ${days.length} 天`)
}

/* 按年份写成日期范围，走得上 date 主键的索引 */
function inYear(year: number) {
  return and(gte(holidayDays.date, `${year}-01-01`), lt(holidayDays.date, `${year + 1}-01-01`))
}
