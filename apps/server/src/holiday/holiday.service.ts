import type { HolidayDetail } from "@myapi/shared"
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import { eq, like } from "drizzle-orm"

import { DATABASE, type Database } from "../database/database.module.js"
import { holidayDays } from "../database/schema.js"
import { HolidaySource } from "./holiday.source.js"

/** 节假日安排是中国的：「今天」「今年」一律按北京时间算，不跟着服务器的时区走（容器默认是 UTC）。 */
const CHINA_ZONE = "Asia/Shanghai"

/** 每日刷新节假日数据的定时任务名。 */
export const HOLIDAY_REFRESH_JOB = "holiday-refresh"

/* en-CA 的日期格式恰好是 YYYY-MM-DD */
const CHINA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: CHINA_ZONE })

/** 北京时间的今天，YYYY-MM-DD。 */
function chinaToday(): string {
  return CHINA_DATE.format(new Date())
}

/** 休息日查询：节假日安排里有的按安排，没有的按周末判断；以及安排数据的定期刷新。 */
@Injectable()
export class HolidayService implements OnModuleInit {
  private readonly logger = new Logger(HolidayService.name)

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly source: HolidaySource,
  ) {}

  /**
   * 启动时拉当年和次年。库里已经有今年的安排就放到后台去拉，不拖慢启动，拉不到只记日志——
   * 数据源在 GitHub 上，偶尔又慢又连不上，不该连登录、图库一起起不来。连今年的都没有才等它拉完再开始监听端口，
   * 拉不到就拒绝启动，免得接口带着空表一直按周末规则回错误答案。
   */
  async onModuleInit() {
    if (!(await this.hasYear(currentYear()))) {
      await this.refreshUpcomingYears()
      return
    }
    this.refreshUpcomingYears().catch((error: unknown) =>
      this.logger.error("启动时刷新节假日数据失败，先用库里已有的数据", error instanceof Error ? error.stack : error),
    )
  }

  /**
   * 数据源一年只更新几次（次年安排公布、临时调休），每天拉一次足够。失败只记日志，第二天再试。
   * 上一次还没跑完就不再叠一次。
   */
  @Cron("0 30 4 * * *", { name: HOLIDAY_REFRESH_JOB, timeZone: CHINA_ZONE, waitForCompletion: true })
  async refreshDaily() {
    try {
      await this.refreshUpcomingYears()
    } catch (error) {
      this.logger.error("定时刷新节假日数据失败", error instanceof Error ? error.stack : error)
    }
  }

  /** 表中没有安排的日期按周末判断，此时名称为空。省略日期或给空串时查北京时间的今天。 */
  async query(requested?: string): Promise<HolidayDetail> {
    const date = requested || chinaToday()
    const [day] = await this.db
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
  private async refreshUpcomingYears() {
    const year = currentYear()
    await Promise.all([this.refreshYear(year), this.refreshYear(year + 1)])
  }

  /** 以「先删后插」替换一整年。 */
  private async refreshYear(year: number) {
    /* 拉取放在事务外，免得一次慢请求白占着数据库连接 */
    const days = await this.source.fetchYear(year)
    /*
     * 拉到空的就不动库：一年的安排公布之后不会变回没有，拉到空的只能是还没发布，
     * 或者数据源出了岔子（路径变了、全回 404），这时先删后插只会把已有的安排清掉
     */
    if (days.length === 0) {
      this.logger.log(`节假日安排还没有发布 year=${year}`)
      return
    }
    /* 删和插在一个事务里：中途出错即回滚，不会留下「旧的没了、新的也没进来」的空年份 */
    await this.db.transaction(async (tx) => {
      await tx.delete(holidayDays).where(like(holidayDays.date, `${year}-%`))
      await tx.insert(holidayDays).values(days)
    })
    this.logger.log(`已刷新节假日数据 year=${year} count=${days.length}`)
  }

  private async hasYear(year: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: holidayDays.id })
      .from(holidayDays)
      .where(like(holidayDays.date, `${year}-%`))
      .limit(1)
    return rows.length > 0
  }
}

function currentYear(): number {
  return Number(chinaToday().slice(0, 4))
}
