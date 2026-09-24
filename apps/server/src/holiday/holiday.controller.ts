import { holidayQuerySchema, type HolidayDetail, type HolidayQuery } from "@myapi/shared"
import { Controller, Get, Header, Query } from "@nestjs/common"

import { Public } from "@/auth/auth.decorators.js"
import { HolidayService } from "@/holiday/holiday.service.js"

/** 这两条有外部调用方，不要求登录。 */
@Public()
@Controller("holiday")
export class HolidayController {
  constructor(private readonly holidays: HolidayService) {}

  /**
   * 只回这天是不是休息日，响应体就是一个 JSON 布尔值。
   * Nest 把非对象的返回值当纯文本发出，所以这里显式标上 JSON 类型，外部调用方按 JSON 解析。
   */
  @Get("is-holiday")
  @Header("Content-Type", "application/json; charset=utf-8")
  async isHoliday(@Query({ schema: holidayQuerySchema }) { date }: HolidayQuery): Promise<string> {
    const day = await this.holidays.query(date)
    return JSON.stringify(day.isOffDay)
  }

  /** 是不是休息日，外加对应的节假日名称。 */
  @Get("detail")
  detail(@Query({ schema: holidayQuerySchema }) { date }: HolidayQuery): Promise<HolidayDetail> {
    return this.holidays.query(date)
  }
}
