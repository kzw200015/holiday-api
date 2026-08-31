import type { Context, MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"
import { sign, verify } from "hono/jwt"
import { unauthorized } from "../web/apiResponse"

/** 挂在 context 上的登录态，子路由用 `new Hono<SessionEnv>()` 声明后就能拿到 c.get("userId")。 */
export type SessionEnv = { Variables: { userId: number } }

/** Authorization 头的固定前缀。 */
const BEARER_PREFIX = "Bearer "

/**
 * 签名算法。签发和校验都写死这一个，不看令牌头里的 alg——
 * 照着令牌自称的算法去验，就等于让攻击者自己挑用哪把锁。
 */
const ALGORITHM = "HS256"

/**
 * 无状态令牌鉴权：登录后签发 JWT，客户端自己存着，每次请求放进 Authorization 头。
 *
 * 用请求头而不是 Cookie，是因为 Cookie 由浏览器自动携带，跨站表单就能借用户的身份发写请求，
 * 于是还得配一层 CSRF 校验；令牌要前端主动取出来塞进头里，跨站页面读不到也就伪造不了。
 * 代价是 <img src> 这类浏览器直接发起的请求带不了头——图片改走签名地址，见 crypto/attachmentSigner.ts。
 *
 * 令牌是无状态的：服务端不存已签发的令牌，所以没法强制踢掉某个会话，只能等它过期。
 * 真要做的话，加一个 users.token_epoch 列、签进载荷、改密码时 +1 即可全端下线，
 * 但那样每次校验又要查库，得重新权衡。
 */
export class JwtAuth {
  private readonly secret: string
  private readonly ttlMs: number

  /** 强制登录：没有可用令牌直接回 401，有就把 userId 挂到 context 上。 */
  readonly middleware: MiddlewareHandler<SessionEnv> = createMiddleware<SessionEnv>(async (c, next) => {
    const userId = await this.read(c)
    if (userId === null) {
      return c.json(unauthorized("请先登录"), 401)
    }
    c.set("userId", userId)
    await next()
  })

  constructor({ secret, ttlMs }: { secret: string; ttlMs: number }) {
    this.secret = secret
    this.ttlMs = ttlMs
  }

  /** 登录成功后签发令牌，交给前端自己保存。 */
  async issue(userId: number): Promise<string> {
    // exp 是秒级 Unix 时间戳，这是 JWT 规范定的单位，verify 会照着它判过期
    const expiresAt = Math.floor((Date.now() + this.ttlMs) / 1000)
    return sign({ sub: userId, exp: expiresAt }, this.secret, ALGORITHM)
  }

  /**
   * 软读取：没带令牌、签名不对、载荷坏了、已过期都返回 null 而不是抛错。
   * GET /api/auth/me 用它来回答「当前是谁」而不触发 401——前端拿 401 会跳登录页，
   * 那样登录页自己一进去就会被弹回来。
   */
  async read(c: Context): Promise<number | null> {
    const header = c.req.header("Authorization") ?? ""
    if (!header.startsWith(BEARER_PREFIX)) {
      return null
    }

    // verify 会校验签名和 exp，任何一项不过就抛错，这里一律按未登录处理
    const payload = await verify(header.slice(BEARER_PREFIX.length), this.secret, ALGORITHM).catch(() => null)
    if (!payload) {
      return null
    }

    const userId = Number(payload.sub)
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null
  }
}
