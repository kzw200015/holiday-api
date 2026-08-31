import { createMiddleware } from "hono/factory"
import { logger } from "../logger"

/**
 * 访问日志相关的 context 变量。
 * 请求量特别大的路由（目前是两个图片接口）自己把 quietAccessLog 设成 true，
 * 中间件据此降级——哪条路由吵是那条路由自己的事，通用设施不该认识具体业务路径。
 */
export type AccessLogEnv = { Variables: { quietAccessLog?: boolean } }

/**
 * 每个请求记一行访问日志：方法、路径、状态码、耗时。
 * 只挂在 /api 下，静态资源请求不记，否则前端一次刷新就刷屏。
 *
 * 这里不需要 try/catch：Hono 的 compose 在抛出异常的那一层就把它交给 onError 了，
 * 上游中间件的 await next() 根本不会 reject。onError 把翻译好的响应写回 c.res，
 * 所以下面读到的状态码就是真正回给客户端的那个（429、400……），不是笼统的 500。
 */
export const requestLogger = createMiddleware<AccessLogEnv>(async (c, next) => {
  const startedAt = performance.now()
  await next()
  // 一屏缩略图加一页阅读就是几十个请求，和静态资源同理，降到 debug 免得把别的日志冲没
  const level = c.get("quietAccessLog") && c.res.status < 400 ? "debug" : "info"
  logger[level](
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    },
    "请求完成",
  )
})
