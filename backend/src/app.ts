import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { internalServerError, notFound } from "./apiresponse/apiResponse"
import { createHolidayController, type HolidayQuerier } from "./holiday/holidayController"

export interface AppDependencies {
  holidayService: HolidayQuerier
  /** 前端构建产物目录，目录不存在时所有非 /api 路径都会 404。 */
  staticDir: string
}

/**
 * 组装 HTTP 应用：路由、静态资源与统一的 404 / 异常处理。
 * 依赖从外部传入，测试时可以用假的 service 替换而不碰数据库与远程数据源。
 */
export function createApp({ holidayService, staticDir }: AppDependencies) {
  const app = new Hono()

  app.route("/api/holiday", createHolidayController(holidayService))
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

  // 未捕获异常统一转成 ApiResponse 结构的 500
  app.onError((err, c) => {
    console.error(`未捕获异常: ${c.req.path}`, err)
    return c.json(internalServerError(err.message || "Internal Server Error"), 500)
  })

  return app
}
