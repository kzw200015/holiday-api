import { createMiddleware } from "hono/factory"

import { Logger } from "@server/logger"

const logger = new Logger(import.meta.url)

/**
 * 每个接口请求结束时记一行：方法、路径、状态码、耗时。只挂在 /api 下，前端静态文件不记。
 *
 * 耗时算到响应交给 Bun 为止：图片接口是边读边转发的，这里只算到开始发图，不含整张图的传输时间。
 * 失败在这之前已经由 app.ts 的 onError 回成了响应，状态码照样取得到。只记路径不记查询串：图片地址的查询串里是签名。
 */
export const requestLog = createMiddleware(async (c, next) => {
  const start = performance.now()
  await next()
  const aborted = c.req.raw.signal.aborted ? " 客户端中途断开" : ""
  logger.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - start)}ms${aborted}`)
})
