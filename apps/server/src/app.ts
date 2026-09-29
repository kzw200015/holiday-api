import { Hono } from "hono"

import { healthRoutes } from "@server/health/health-routes"
import { holidayRoutes } from "@server/holiday/holiday-routes"
import { HttpError, notFound } from "@server/http-error"
import { Logger } from "@server/logger"
import { requestLog } from "@server/request-log"

const logger = new Logger(import.meta.url)

/** 整个应用：接口一律挂在 /api 下，各领域的路由只写领域内的路径。 */
export const app = new Hono()
  .use("/api/*", requestLog)
  .route("/api", new Hono().route("/holiday", holidayRoutes).route("/health", healthRoutes))
  /*
   * 所有失败都回成 `{statusCode, message, error}`。可预期的失败自己带着状态码与文案（入参不合格见 validate.ts）；
   * 未预料的异常回 500，原文只进日志。
   */
  .onError((error, c) => {
    let failure: HttpError
    if (error instanceof HttpError) {
      failure = error
    } else {
      logger.error("未预料的异常", error)
      failure = new HttpError(500, "服务器出错了")
    }
    return c.json(failure.body, failure.status)
  })
  /* 写错的路径、方法不对的请求，拿到的都是 JSON 的 404 */
  .notFound((c) => {
    const failure = notFound("这个地址不存在")
    return c.json(failure.body, failure.status)
  })
