import { Logger } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"

const logger = new Logger("Request")

/**
 * 每个接口请求结束时记一行：方法、路径、状态码、耗时。
 *
 * 耗时算到响应发完或连接断开为止，图片接口包含整张图的传输时间。只记路径不记查询串：图片地址的查询串里是签名。
 */
export function requestLog(request: Request, response: Response, next: NextFunction) {
  const start = performance.now()
  response.once("close", () => {
    const elapsed = Math.round(performance.now() - start)
    const path = request.originalUrl.replace(/\?.*/s, "")
    const status = response.headersSent ? response.statusCode : "-"
    const aborted = response.writableFinished ? "" : " 客户端中途断开"
    logger.log(`${request.method} ${path} ${status} ${elapsed}ms${aborted}`)
  })
  next()
}
