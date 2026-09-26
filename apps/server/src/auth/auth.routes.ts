import { credentialsSchema, loginSchema } from "@myapi/shared/auth"
import { Elysia } from "elysia"

import * as authService from "@server/auth/auth.service"
import type { AuthOptions } from "@server/auth/auth.service"
import { maybeSignedIn } from "@server/auth/session"

/** 登录页要用的这几条都不要求登录。e 站的绑定状态是 eh 的事，不在这里返回。 */
export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(maybeSignedIn)
  /* 登录页据此决定给不给注册入口，否则关了注册的站点上，用户要把表单填完提交了才知道注册不了 */
  .get("/options", (): AuthOptions => ({ allowRegistration: authService.registrationOpen }))
  .post("/register", ({ body }) => authService.register(body), { body: credentialsSchema })
  .post("/login", ({ body }) => authService.login(body), { body: loginSchema })
  /* 当前登录者。未登录或账号已被删都是 200 的 null：前端拿 401 会跳登录页，而登录页自己也要问「我是谁」 */
  .get("/me", async ({ userId }) => (userId === null ? null : authService.find(userId)))
