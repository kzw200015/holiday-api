import { Elysia } from "elysia"

import { authRoutes } from "@server/auth/auth.routes"
import { ehRoutes } from "@server/eh/eh.routes"
import { healthRoutes } from "@server/health/health.routes"
import { holidayRoutes } from "@server/holiday/holiday.routes"
import { badRequest, HttpError, notFound } from "@server/http-error"
import { Logger } from "@server/logger"
import { requestLog } from "@server/request-log"
import { staticFiles } from "@server/static-files"

const logger = new Logger("App")

/**
 * 整个应用：接口一律挂在 /api 下，各领域的路由只写领域内的路径；其余路径是前端的静态文件。
 * 前端从这里的 App 类型推断每条接口的入参与响应（Eden），所以路由的写法就是接口契约。
 */
export const app = new Elysia()
  .use(requestLog)
  /*
   * 所有失败都回成 `{statusCode, message, error}`。可预期的失败自己带着状态码与文案；入参不合格时 message 是
   * 共享 schema 里的那组中文文案，不带字段路径（文案本身已经说清了是哪一项），前端直接展示；未预料的异常回 500，原文只进日志。
   */
  .onError(({ code, error, set }) => {
    let failure: HttpError
    if (error instanceof HttpError) {
      failure = error
    } else if (code === "VALIDATION") {
      failure = badRequest([...new Set(error.all.map((issue) => issue.message))])
    } else if (code === "PARSE") {
      failure = badRequest("请求体不是合法的 JSON")
    } else if (code === "NOT_FOUND") {
      failure = notFound("这个地址不存在")
    } else {
      logger.error("未预料的异常", error instanceof Error ? error.stack : error)
      failure = new HttpError(500, "服务器出错了")
    }
    set.status = failure.status
    return failure.body
  })
  .use(new Elysia({ prefix: "/api" }).use(authRoutes).use(ehRoutes).use(holidayRoutes).use(healthRoutes))
  .use(staticFiles)

export type App = typeof app
