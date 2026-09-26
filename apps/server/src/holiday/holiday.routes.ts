import { holidayQuerySchema } from "@myapi/shared/holiday"
import { Elysia } from "elysia"

import * as holidayService from "@server/holiday/holiday.service"

/** 这两条有外部调用方，不要求登录。 */
export const holidayRoutes = new Elysia({ prefix: "/holiday" })
  /* 只回这天是不是休息日，响应体就是一个 JSON 布尔值：直接返回布尔值会被当成纯文本发出，外部调用方按 JSON 解析 */
  .get("/is-holiday", async ({ query }) => Response.json((await holidayService.query(query.date)).isOffDay), {
    query: holidayQuerySchema,
  })
  /* 是不是休息日，外加对应的节假日名称 */
  .get("/detail", ({ query }) => holidayService.query(query.date), { query: holidayQuerySchema })
