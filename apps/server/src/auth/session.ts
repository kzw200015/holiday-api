import { createMiddleware } from "hono/factory"

import * as tokens from "@server/auth/tokens"
import { unauthorized } from "@server/http-error"

/*
 * 鉴权边界。身份只认 Authorization 头里的登录令牌，不认请求里的任何 userId。
 *
 * 身份走 Authorization 头而不是 Cookie，所以也没有 CSRF 防护：跨站伪造之所以成立，是因为 Cookie
 * 由浏览器自动带上；令牌要前端主动取出来塞进头里，跨站页面读不到也就冒名不了。
 *
 * 两个中间件都逐条写在路由上、排在入参校验之前：没登录的请求先拿到 401，不会先看到入参哪里不合格。
 * 不在一组路由上 use：use 挂的是路径前缀，eh 下要登录的路由和公开的图片接口共用前缀，会一并被拦住。
 * 公开接口的清单由接口测试按整张路由表锁住，漏写的代价是那条测试失败，而不是把接口裸露出去。
 */

/** 要求登录：`c.get("userId")` 一定有值，没登录回 401。 */
export const signedIn = createMiddleware<{ Variables: { userId: number } }>(async (c, next) => {
  const userId = await tokens.identify(c.req.header("authorization"))
  if (userId === null) {
    throw unauthorized("请先登录")
  }
  c.set("userId", userId)
  await next()
})

/** 公开接口上认出登录者（「我是谁」要用）：没登录或令牌无效时 userId 是 null。 */
export const maybeSignedIn = createMiddleware<{ Variables: { userId: number | null } }>(async (c, next) => {
  c.set("userId", await tokens.identify(c.req.header("authorization")))
  await next()
})
