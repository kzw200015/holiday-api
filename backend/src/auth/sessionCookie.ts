import type { Context } from "hono"
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"
import { unauthorized } from "../apiresponse/apiResponse"

/** 会话 Cookie 的名字。 */
const COOKIE_NAME = "myapi_session"

/** 挂在 context 上的登录态，子路由用 `new Hono<SessionEnv>()` 声明后就能拿到 c.get("userId")。 */
export type SessionEnv = { Variables: { userId: number } }

export type SessionCookie = ReturnType<typeof createSessionCookie>

/**
 * 会话用「签名 Cookie」而不是服务端会话表，也不是 JWT 请求头：
 *
 * - 不用请求头，是因为图片代理接口要被 <img src> 直接请求，而 <img> 带不了 Authorization 头，
 *   只能靠同源 Cookie 自动携带。整条鉴权链都由这一点决定。
 * - 不用会话表，是因为图片代理是全系统 QPS 最高的接口（一屏缩略图就是几十个请求），
 *   每个请求查一次库等于给数据库白加几十倍负载；验签是纯 CPU 的。
 *
 * 代价是没法从服务端强制踢掉某个已签发的会话，只能等它过期。这个规模下可以接受。
 * 真要做的话，加一个 users.session_epoch 列、签进载荷、改密码时 +1 即可全端下线，
 * 但那样每次校验又要查库，得重新权衡。
 */
export function createSessionCookie({ secret, ttlMs, secure }: { secret: string; ttlMs: number; secure: boolean }) {
  return {
    /** 强制登录：未登录直接回 401，登录了就把 userId 挂到 context 上。 */
    middleware: createMiddleware<SessionEnv>(async (c, next) => {
      const userId = await read(c)
      if (userId === null) {
        return c.json(unauthorized("请先登录"), 401)
      }
      c.set("userId", userId)
      await next()
    }),

    read,

    /** 登录成功后签发会话。 */
    async issue(c: Context, userId: number): Promise<void> {
      const expiresAt = Date.now() + ttlMs
      await setSignedCookie(c, COOKIE_NAME, `${userId}.${expiresAt}`, secret, {
        httpOnly: true,
        // Lax 既允许 <img> 这类同站加载带上 Cookie，又能挡住跨站发起的 POST
        sameSite: "Lax",
        secure,
        path: "/",
        maxAge: Math.floor(ttlMs / 1000),
      })
    },

    /** 退出登录。 */
    clear(c: Context): void {
      deleteCookie(c, COOKIE_NAME, { path: "/", secure, sameSite: "Lax" })
    },
  }

  /**
   * 软读取：没登录、签名不对、载荷坏了、已过期都返回 null 而不是抛错。
   * GET /api/auth/me 用它来回答「当前是谁」而不触发 401——前端拿 401 会跳登录页，
   * 那样登录页自己一进去就会被弹回来。
   */
  async function read(c: Context): Promise<number | null> {
    const payload = await getSignedCookie(c, secret, COOKIE_NAME)
    if (!payload) {
      return null
    }

    const [userIdText, expiresAtText] = payload.split(".")
    const userId = Number(userIdText)
    const expiresAt = Number(expiresAtText)
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(expiresAt)) {
      return null
    }
    // Cookie 自身的 maxAge 已经会让浏览器丢弃，但过期时间也签在载荷里，
    // 免得有人把 Cookie 复制出来长期使用
    return expiresAt > Date.now() ? userId : null
  }
}
