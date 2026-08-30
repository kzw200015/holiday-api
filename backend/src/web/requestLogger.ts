import { createMiddleware } from "hono/factory"
import { logger } from "../logger"

/** 图片代理的路径。这类请求量极大，记 info 会把日志淹掉。 */
const IMAGE_PATH_RE = /^\/api\/eh\/(thumbnail|galleries\/.+\/image)$/

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
  // 一屏缩略图加一页阅读就是几十个请求，和静态资源同理，降到 debug 免得把别的日志冲没
  const level = IMAGE_PATH_RE.test(c.req.path) && c.res.status < 400 ? "debug" : "info"
  logger[level]({ ...fields(), status: c.res.status }, "请求完成")
})
