import { join, sep } from "node:path"
import { Elysia, NotFoundError } from "elysia"

/* 镜像里前端产物放在 apps/server/client，本文件往上一级；开发时没有这个目录，一律 404 */
const CLIENT = join(import.meta.dirname, "../client")

/**
 * 前端的静态文件。前端用哈希路由，只有根路径回 index.html；其余路径照文件名找，找不到回 404，
 * /api 下写错的路径、方法不对的请求也落到这里，拿到的是 JSON 的 404 而不是一个页面。
 *
 * 带哈希的构建产物（/assets/ 下）内容变了文件名就变，让浏览器一直缓存；其余的（index.html、service worker、
 * 图标）每次都回源确认，部署新版本后才拿得到新的入口。
 */
export const staticFiles = new Elysia().get("/", () => serve("/index.html")).get("/*", ({ path }) => serve(path))

async function serve(path: string): Promise<Response> {
  /* 路径已经由 URL 解析去掉了 . 与 ..，这里再确认一遍落在目录里面 */
  const file = Bun.file(join(CLIENT, path))
  if (!file.name?.startsWith(CLIENT + sep) || !(await file.exists())) {
    /* 交给 app.ts 的 onError，404 只在那一处成形 */
    throw new NotFoundError()
  }
  const cacheControl = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"
  return new Response(file, { headers: { "Cache-Control": cacheControl } })
}
