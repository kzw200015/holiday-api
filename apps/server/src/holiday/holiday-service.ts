import { Cron } from "croner"
import { eq, like } from "drizzle-orm"

import { database } from "@server/database/connection"
import * as holidaySource from "@server/holiday/holiday-source"
import { holidayDays } from "@server/holiday/holiday-tables"
import { Logger } from "@server/logger"

/* 休息日查询：节假日安排里有的按安排，没有的按周末判断；以及安排数据的定期刷新。 */

const logger = new Logger(import.meta.url)

/** 某一天的节假日安排 */
export interface HolidayDetail {
  /** 查询的日期，格式 YYYY-MM-DD */
  date: string
  /** 是否为休息日 */
  isOffDay: boolean
  /** 节假日名称；为空表示该日期不在节假日安排里（普通工作日或普通周末） */
  name: string
}

/** 节假日安排是中国的：「今天」「今年」一律按北京时间算，不跟着服务器的时区走（容器默认是 UTC）。 */
const CHINA_ZONE = "Asia/Shanghai"

/* en-CA 的日期格式恰好是 YYYY-MM-DD */
const CHINA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: CHINA_ZONE })

/** 北京时间的今天，YYYY-MM-DD。 */
function chinaToday(): string {
  return CHINA_DATE.format(new Date())
}

function currentYear(): number {
  return Number(chinaToday().slice(0, 4))
}

/**
 * 启动时拉当年和次年，在开始监听端口之前调用。库里已经有今年的安排就放到后台去拉，不拖慢启动，拉不到只记日志——
 * 数据源在 GitHub 上，偶尔又慢又连不上，不该连登录、图库一起起不来。连今年的都没有才等它拉完，
 * 拉不到就拒绝启动，免得接口带着空表一直按周末规则回错误答案。
 */
export async function refreshOnStartup() {
  if (!(await hasYear(currentYear()))) {
    await refreshUpcomingYears()
    return
  }
  refreshUpcomingYears().catch((error: unknown) => logger.error("启动时刷新节假日数据失败，先用库里已有的数据", error))
}

/**
 * 每天北京时间 4:30 刷新一次：数据源一年只更新几次（次年安排公布、临时调休），每天拉一次足够。
 * 失败只记日志，第二天再试；上一次还没跑完就跳过这一次，不叠着跑。关停时要 stop() 掉返回的任务。
 */
export function scheduleDailyRefresh(): Cron {
  return new Cron("0 30 4 * * *", { timezone: CHINA_ZONE, protect: true }, async () => {
    try {
      await refreshUpcomingYears()
    } catch (error) {
      logger.error("定时刷新节假日数据失败", error)
    }
  })
}

/** 表中没有安排的日期按周末判断，此时名称为空。省略日期或给空串时查北京时间的今天。 */
export async function query(requested?: string): Promise<HolidayDetail> {
  const date = requested || chinaToday()
  const [day] = await database
    .select({ date: holidayDays.date, isOffDay: holidayDays.isOffDay, name: holidayDays.name })
    .from(holidayDays)
    .where(eq(holidayDays.date, date))
  if (day) {
    return day
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return { date, isOffDay: weekday === 0 || weekday === 6, name: "" }
}

/** 刷新当年和次年。年份每次重新算，跨年后自然带上新的次年；两年互不依赖所以并行，任一失败即整体失败。 */
async function refreshUpcomingYears() {
  const year = currentYear()
  await Promise.all([refreshYear(year), refreshYear(year + 1)])
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
    logger.log(`节假日安排还没有发布 year=${year}`)
    return
  }
  /* 删和插在一个事务里：中途出错即回滚，不会留下「旧的没了、新的也没进来」的空年份 */
  await database.transaction(async (tx) => {
    await tx.delete(holidayDays).where(like(holidayDays.date, `${year}-%`))
    await tx.insert(holidayDays).values(days)
  })
  logger.log(`已刷新节假日数据 year=${year} count=${days.length}`)
}

async function hasYear(year: number): Promise<boolean> {
  const rows = await database
    .select({ id: holidayDays.id })
    .from(holidayDays)
    .where(like(holidayDays.date, `${year}-%`))
    .limit(1)
  return rows.length > 0
}
