import { Elysia } from "elysia"

import { Logger } from "@server/logger"

const logger = new Logger(import.meta.url)

const starts = new WeakMap<Request, number>()

/**
 * 每个接口请求结束时记一行：方法、路径、状态码、耗时。只记 /api 下的，前端静态文件不记。
 *
 * 耗时算到响应交给 Bun 为止：图片接口是边读边转发的，这里只算到开始发图，不含整张图的传输时间。
 * 只记路径不记查询串：图片地址的查询串里是签名。
 */
export const requestLog = new Elysia()
  .onRequest(({ request }) => {
    starts.set(request, performance.now())
  })
  .onAfterResponse({ as: "global" }, ({ request, path, set, responseValue }) => {
    const start = starts.get(request)
    if (!path.startsWith("/api/") || start === undefined) {
      return
    }
    /* 直接返回 Response 的（图片、is-holiday）状态码在它身上，其余的在 set 上 */
    const status = responseValue instanceof Response ? responseValue.status : set.status
    const aborted = request.signal.aborted ? " 客户端中途断开" : ""
    logger.log(`${request.method} ${path} ${status} ${Math.round(performance.now() - start)}ms${aborted}`)
  })
