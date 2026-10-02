import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { logger as requestLogger } from "hono/logger"

import { healthRoutes } from "@server/health/health-routes"
import { holidayRoutes } from "@server/holiday/holiday-routes"
import { createLogger } from "@server/logger"

const logger = createLogger(import.meta.url)

/** 整个应用：接口一律挂在 /api 下，各领域的路由只写领域内的路径。 */
export const app = new Hono()
  /* Hono 自带的请求日志，转进 pino */
  .use(
    "/api/*",
    requestLogger((line) => logger.info(line)),
  )
  .route("/api", new Hono().route("/holiday", holidayRoutes).route("/health", healthRoutes))
  /*
   * 所有失败都回成 `{code, message}`，code 与 HTTP 状态码相同。可预期的失败抛 HTTPException，自己带着状态码与给调用方看的
   * 文案（入参不合格见 validate.ts）；未预料的异常回 500，原文只进日志。
   */
  .onError((error, c) => {
    if (!(error instanceof HTTPException)) {
      logger.error(error, "未预料的异常")
      return c.json({ code: 500, message: "服务器出错了" }, 500)
    }
    return c.json({ code: error.status, message: error.message }, error.status)
  })
  /* 写错的路径、方法不对的请求，拿到的都是 JSON 的 404 */
  .notFound((c) => c.json({ code: 404, message: "这个地址不存在" }, 404))
