import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { csrf } from "hono/csrf"
import { HTTPException } from "hono/http-exception"
import { failure, internalServerError, notFound } from "./apiresponse/apiResponse"
import { createAuthController } from "./auth/authController"
import type { AuthService } from "./auth/authService"
import type { SessionCookie } from "./auth/sessionCookie"
import { createEhController, type EhControllerService } from "./eh/ehController"
import { EH_FAILURE_STATUS, isEhFailure } from "./eh/ehFailure"
import { createHolidayController } from "./holiday/holidayController"
import type { HolidayService } from "./holiday/holidayService"
import { logger } from "./logger"
import { requestLogger } from "./web/requestLogger"

/**
 * 组装 HTTP 应用：路由、静态资源与统一的 404 / 异常处理。
 * 依赖从外部传入，测试时可以用假的 service 替换而不碰数据库与远程数据源。
 */
export function createApp({
  holidayService,
  authService,
  ehService,
  sessionCookie,
  trustedOrigins,
  staticDir,
}: {
  holidayService: Pick<HolidayService, "query">
  authService: Pick<AuthService, "register" | "login" | "findUserById">
  ehService: EhControllerService
  sessionCookie: SessionCookie
  /** 除同源外还允许发起写请求的来源，见 config.security.trustedOrigins。 */
  trustedOrigins: string[]
  /** 前端构建产物目录，目录不存在时所有非 /api 路径都会 404。 */
  staticDir: string
}) {
  const app = new Hono()

  app.use("/api/*", requestLogger)

  // 只校验非 GET 请求的 Origin，所以有外部调用方的 GET /api/holiday/is-holiday 不受影响。
  // 会话 Cookie 已经是 SameSite=Lax，这一层是补刀
  app.use("/api/*", csrf({ origin: (origin, c) => origin === new URL(c.req.url).origin || trustedOrigins.includes(origin) }))

  // 会话校验绝不能挂在 /api/* 上：is-holiday 有外部调用方，会被一起挡掉。
  // 需要登录的接口在各自的子路由内部挂 sessionCookie.middleware
  app.route("/api/holiday", createHolidayController(holidayService))
  app.route("/api/auth", createAuthController({ authService, sessionCookie }))
  app.route("/api/eh", createEhController({ ehService, sessionCookie }))
  // 其余 /api 路径统一返回 JSON 格式的 404；挂在静态资源之前，省得去磁盘找 public/api/... 文件
  app.all("/api/*", (c) => c.json(notFound(), 404))

  // 前端产物兜底：只命中真实存在的文件（目录取 index.html），找不到就交给 notFound；
  // 前端是哈希路由，不需要把未知路径都重写到 index.html
  app.get(
    "*",
    serveStatic({
      root: staticDir,
      // Vite 打出的 assets/ 文件名带内容 hash，可以永久缓存；其余文件（index.html 等）每次都重新取
      onFound: (path, c) => {
        c.header("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache")
      },
    }),
  )

  // 非 /api 路径找不到静态文件：保持无响应体的 404（前端是哈希路由，静态资源兜底逻辑依赖这一点）
  app.notFound((c) => c.body(null, 404))

  // 未捕获异常统一转成 ApiResponse 结构的 500。
  // 异常翻译都得写在这里：Hono 的 compose 在抛出的那一层就把异常交给 onError 了，
  // 上游中间件的 await next() 不会 reject，所以中间件里 catch 不到
  app.onError((err, c) => {
    // csrf 这类中间件抛的 HTTPException 自带状态码，一律转成 500 会把「请求被拒绝」说成「服务器出错」
    if (err instanceof HTTPException) {
      logger.warn({ status: err.status, method: c.req.method, path: c.req.path }, "请求被中间件拒绝")
      return c.json(failure(err.status, err.message || "Forbidden"), err.status)
    }
    // e 站那边可预期的失败（配额用尽、被限流、Cookie 失效）有各自的状态码，
    // 混进 500 的话「额度没了」和「服务器崩了」在前端就分不出来
    if (isEhFailure(err)) {
      const status = EH_FAILURE_STATUS[err.ehKind]
      logger.warn({ kind: err.ehKind, method: c.req.method, path: c.req.path }, "e 站请求失败")
      return c.json(failure(status, err.message), status)
    }
    logger.error({ err, method: c.req.method, path: c.req.path }, "未捕获异常")
    return c.json(internalServerError(err.message || "Internal Server Error"), 500)
  })

  return app
}
