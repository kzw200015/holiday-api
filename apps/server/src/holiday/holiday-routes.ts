import { Hono } from "hono"
import { z } from "zod"

import { isCalendarDate } from "@server/holiday/calendar-date"
import * as holidayService from "@server/holiday/holiday-service"
import { validate } from "@server/validate"

const DATE_RULE = "日期格式错误，应为 YYYY-MM-DD"

/* 两条接口的查询参数一样：省略或空串表示北京时间的今天。 */
const holidayQuery = z.object({
  date: z
    .string({ error: DATE_RULE })
    .refine((date) => date === "" || isCalendarDate(date), DATE_RULE)
    .optional(),
})

/** 这两条是公开接口，有外部调用方。 */
export const holidayRoutes = new Hono()
  /* 只回这天是不是休息日，响应体就是一个 JSON 布尔值 */
  .get("/is-holiday", validate("query", holidayQuery), async (c) =>
    c.json((await holidayService.query(c.req.valid("query").date)).isOffDay),
  )
  /* 是不是休息日，外加对应的节假日名称 */
  .get("/detail", validate("query", holidayQuery), async (c) =>
    c.json(await holidayService.query(c.req.valid("query").date)),
  )
