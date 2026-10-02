import { Hono } from "hono"
import { z } from "zod"

import * as holidayService from "@server/holiday/holiday-service"
import { validate } from "@server/validate"

const DATE_RULE = "日期要写成 YYYY-MM-DD，且是真实存在的一天"

/* 两条接口的查询参数一样：省略或空串表示北京时间的今天，空串在这里就转成省略 */
const holidayQuery = z.object({
  date: z
    .union([z.literal("").transform(() => undefined), z.iso.date({ error: DATE_RULE })], { error: DATE_RULE })
    .optional(),
})

/** 节假日的两条接口。调用方是自己的其他程序：路径与成功时的响应体改了，要同步改调用方。 */
export const holidayRoutes = new Hono()
  /* 只回这天是不是休息日，响应体就是一个 JSON 布尔值 */
  .get("/is-holiday", validate("query", holidayQuery), async (c) =>
    c.json((await holidayService.query(c.req.valid("query").date)).isOffDay),
  )
  /* 是不是休息日，外加对应的节假日名称 */
  .get("/detail", validate("query", holidayQuery), async (c) =>
    c.json(await holidayService.query(c.req.valid("query").date)),
  )
