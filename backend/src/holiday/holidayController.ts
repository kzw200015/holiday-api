import { Hono } from "hono"
import { z } from "zod"
import { ok } from "../web/apiResponse"
import { calendarDateSchema, todayDate } from "../time/date"
import { apiValidator } from "../web/apiValidator"
import type { HolidayService } from "./holidayService"

/**
 * date 参数：省略或空串取当天，否则必须是合法的 YYYY-MM-DD，校验通过后处理函数拿到的是解析好的 CalendarDate。
 * 同名参数重复出现会被解析成数组，同样落进 union 的错误分支，所以类型错误也用这一条提示。
 */
const dateQuerySchema = z.object({
  date: z
    .union([z.literal(""), calendarDateSchema], { error: "日期格式错误，应为 YYYY-MM-DD" })
    .optional()
    .transform((value) => value || todayDate()),
})

/**
 * 节假日相关的 HTTP 接口，挂载在 /api/holiday 下。
 * 只依赖 service 的查询能力，测试时可以直接传一个只有 query 的对象。
 */
export class HolidayController extends Hono {
  constructor(holidayService: Pick<HolidayService, "query">) {
    super()

    /**
     * GET /api/holiday/is-holiday?date=YYYY-MM-DD，仅返回是否休息。
     * 该接口有外部调用方，响应契约固定为 boolean，不要改动。
     */
    this.get("/is-holiday", apiValidator("query", dateQuerySchema), async (c) => {
      const { isOffDay } = await holidayService.query(c.req.valid("query").date)
      return c.json(ok(isOffDay))
    })

    /** GET /api/holiday/detail?date=YYYY-MM-DD，返回是否休息及对应的节假日名称。 */
    this.get("/detail", apiValidator("query", dateQuerySchema), async (c) => {
      return c.json(ok(await holidayService.query(c.req.valid("query").date)))
    })
  }
}
