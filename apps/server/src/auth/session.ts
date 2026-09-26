import { Elysia } from "elysia"

import * as tokens from "@server/auth/tokens"
import { unauthorized } from "@server/http-error"

/*
 * 鉴权边界。身份只认 Authorization 头里的登录令牌，不认请求里的任何 userId。
 *
 * 身份走 Authorization 头而不是 Cookie，所以也没有 CSRF 防护：跨站伪造之所以成立，是因为 Cookie
 * 由浏览器自动带上；令牌要前端主动取出来塞进头里，跨站页面读不到也就冒名不了。
 *
 * 两个插件都用 derive（在入参校验之前执行）：没登录的请求先拿到 401，不会先看到入参哪里不合格。
 * 作用域是 scoped：只作用于 use 它的那组路由。要登录的一组路由 use signedIn，公开的不 use；
 * 公开接口的清单由接口测试按整张路由表锁住，漏 use 的代价是那条测试失败，而不是把接口裸露出去。
 */

/** 要求登录：上下文里的 userId 一定有值，没登录回 401。 */
export const signedIn = new Elysia().derive({ as: "scoped" }, async ({ headers }) => {
  const userId = await tokens.identify(headers.authorization)
  if (userId === null) {
    throw unauthorized("请先登录")
  }
  return { userId }
})

/** 公开接口上认出登录者（「我是谁」要用）：没登录或令牌无效时 userId 是 null。 */
export const maybeSignedIn = new Elysia().derive({ as: "scoped" }, async ({ headers }) => ({
  userId: await tokens.identify(headers.authorization),
}))
