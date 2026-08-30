import { createMiddleware } from "hono/factory"
import { logger } from "../logger"

/**
 * 每个请求记一行访问日志：方法、路径、状态码、耗时。
 * 只挂在 /api 下，静态资源请求不记，否则前端一次刷新就刷屏。
 * 处理链抛错时 onError 会另记一条带堆栈的错误日志，这里只按 500 记访问日志然后原样抛出去。
 */
export const requestLogger = createMiddleware(async (c, next) => {
  const startedAt = performance.now()
  const fields = () => ({
    method: c.req.method,
    path: c.req.path,
    durationMs: Math.round(performance.now() - startedAt),
  })
  try {
    await next()
  } catch (err) {
    logger.info({ ...fields(), status: 500 }, "请求完成")
    throw err
  }
  logger.info({ ...fields(), status: c.res.status }, "请求完成")
})
