import { join, sep } from "node:path"
import { Hono } from "hono"
import { serveStatic } from "hono/bun"

/* 镜像里前端产物放在 apps/server/client，本文件往上一级；开发时没有这个目录，一律 404 */
const CLIENT = join(import.meta.dirname, "../client")

/* 带哈希的构建产物，内容变了文件名就变 */
const ASSETS = join(CLIENT, "assets") + sep

/**
 * 前端的静态文件。前端用哈希路由，只有根路径回 index.html；其余路径照文件名找，
 * 找不到的交给 app.ts 的 notFound，/api 下写错的路径拿到的也是 JSON 的 404 而不是一个页面。
 * 只挂在 GET 上：serveStatic 自己不看方法，用 use 挂的话 POST 一个文件的路径也会回出文件来。
 *
 * /assets/ 下的让浏览器一直缓存；其余的（index.html、service worker、图标）每次都回源确认，部署新版本后才拿得到新的入口。
 */
export const staticFiles = new Hono().get(
  "/*",
  serveStatic({
    root: CLIENT,
    onFound: (path, c) => {
      c.header("Cache-Control", path.startsWith(ASSETS) ? "public, max-age=31536000, immutable" : "no-cache")
    },
  }),
)
