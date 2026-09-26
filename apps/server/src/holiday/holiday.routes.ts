import { Elysia } from "elysia"
import { z } from "zod"

import { isCalendarDate } from "@server/holiday/calendar-date"
import * as holidayService from "@server/holiday/holiday.service"

const DATE_RULE = "日期格式错误，应为 YYYY-MM-DD"

/* 两条接口的查询参数一样：省略或空串表示北京时间的今天。 */
const holidayQuery = z.object({
  date: z
    .string({ error: DATE_RULE })
    .refine((date) => date === "" || isCalendarDate(date), DATE_RULE)
    .optional(),
})

/** 这两条有外部调用方，不要求登录。 */
export const holidayRoutes = new Elysia({ prefix: "/holiday" })
  /* 只回这天是不是休息日，响应体就是一个 JSON 布尔值：直接返回布尔值会被当成纯文本发出，外部调用方按 JSON 解析 */
  .get("/is-holiday", async ({ query }) => Response.json((await holidayService.query(query.date)).isOffDay), {
    query: holidayQuery,
  })
  /* 是不是休息日，外加对应的节假日名称 */
  .get("/detail", ({ query }) => holidayService.query(query.date), { query: holidayQuery })
