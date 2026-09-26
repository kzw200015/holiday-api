import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import { authRoutes } from "@server/auth/auth.routes"
import { ehRoutes } from "@server/eh/eh.routes"
import { healthRoutes } from "@server/health/health.routes"
import { holidayRoutes } from "@server/holiday/holiday.routes"
import { badRequest, HttpError, notFound } from "@server/http-error"
import { Logger } from "@server/logger"
import { requestLog } from "@server/request-log"
import { staticFiles } from "@server/static-files"

const logger = new Logger(import.meta.url)

/**
 * 整个应用：接口一律挂在 /api 下，各领域的路由只写领域内的路径；其余路径是前端的静态文件。
 * 前端从这里的 App 类型推断每条接口的入参与响应（hono/client），所以路由的写法就是接口契约。
 * 路由要一路链式写下来：拆成几条语句的话，App 类型里就没有后面挂上的那些接口了。
 */
export const app = new Hono()
  .use("/api/*", requestLog)
  .route(
    "/api",
    new Hono()
      .route("/auth", authRoutes)
      .route("/eh", ehRoutes)
      .route("/holiday", holidayRoutes)
      .route("/health", healthRoutes),
  )
  .route("/", staticFiles)
  /*
   * 所有失败都回成 `{statusCode, message, error}`。可预期的失败自己带着状态码与文案（入参不合格见 validate.ts）；
   * 未预料的异常回 500，原文只进日志。
   */
  .onError((error, c) => {
    let failure: HttpError
    if (error instanceof HttpError) {
      failure = error
    } else if (error instanceof HTTPException && error.status === 400) {
      /* Hono 自己抛的 400 只有请求体解析不了这一种：本站的请求体只收 JSON */
      failure = badRequest("请求体不是合法的 JSON")
    } else {
      logger.error("未预料的异常", error)
      failure = new HttpError(500, "服务器出错了")
    }
    return c.json(failure.body, failure.status)
  })
  /* /api 下写错的路径、方法不对的请求，以及找不到的静态文件，拿到的都是 JSON 的 404 而不是一个页面 */
  .notFound((c) => {
    const failure = notFound("这个地址不存在")
    return c.json(failure.body, failure.status)
  })

export type App = typeof app
