import { createMiddleware } from "hono/factory"

import { Logger } from "@server/logger"

const logger = new Logger(import.meta.url)

/**
 * 每个接口请求结束时记一行：方法、路径、状态码、耗时。挂在 /api 下。
 *
 * 耗时算到响应交给 Bun 为止。失败在这之前已经由 app.ts 的 onError 回成了响应，状态码照样取得到。只记路径不记查询串。
 */
export const requestLog = createMiddleware(async (c, next) => {
  const start = performance.now()
  await next()
  const aborted = c.req.raw.signal.aborted ? " 客户端中途断开" : ""
  logger.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - start)}ms${aborted}`)
})
