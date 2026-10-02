import { Hono } from "hono"
import { logger as requestLogger } from "hono/logger"

import { healthRoutes } from "@server/health/health-routes"
import { holidayRoutes } from "@server/holiday/holiday-routes"
import { HttpError, notFound } from "@server/http-error"
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
   * 所有失败都回成 `{code, message}`。可预期的失败自己带着状态码与文案（入参不合格见 validate.ts）；
   * 未预料的异常回 500，原文只进日志。
   */
  .onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(error.body, error.status)
    }
    logger.error(error, "未预料的异常")
    const failure = new HttpError(500, "服务器出错了")
    return c.json(failure.body, failure.status)
  })
  /* 写错的路径、方法不对的请求，拿到的都是 JSON 的 404 */
  .notFound((c) => {
    const failure = notFound("这个地址不存在")
    return c.json(failure.body, failure.status)
  })
