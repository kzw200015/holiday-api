import { jwtVerify, SignJWT } from "jose"
import { z } from "zod"

import { env } from "@server/config"
import { numeric } from "@server/numeric"
import { tokenKey } from "@server/signing"

/*
 * 登录令牌：无状态的 JWT（HS256），载荷只有 sub（账号 id）与签发、过期时间。前端自己保管、每次放进 Authorization 头。
 * 服务端不存已签发的令牌，所以没法强制踢掉某个会话，也就没有登出接口：退出登录就是前端把令牌丢掉。
 */

/** 令牌载荷里的 sub：本站账号 id 的十进制写法。 */
const subject = numeric(z.int().positive(), "令牌载荷不合法")

export function sign(userId: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + Math.floor(env.TOKEN_TTL / 1000))
    .sign(tokenKey)
}

/** 从 Authorization 头认出账号 id。没带令牌、签名不对、载荷坏了、已过期，一律当作没登录，而不是报错。 */
export async function identify(authorization: string | undefined): Promise<number | null> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : ""
  if (!token) {
    return null
  }
  try {
    /* 只认 HS256：照令牌头里自称的 alg 去验，等于让攻击者自己挑用哪把锁（alg: none） */
    const { payload } = await jwtVerify(token, tokenKey, { algorithms: ["HS256"] })
    const parsed = subject.safeParse(payload.sub)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
