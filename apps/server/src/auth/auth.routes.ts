import { Elysia } from "elysia"
import { z } from "zod"

import * as authService from "@server/auth/auth.service"
import { maybeSignedIn } from "@server/auth/session"

const USERNAME_RULE = "用户名只能是 3 到 32 位的字母、数字、下划线或连字符"

/* 密码长度按人眼里的字符（码点）数，不按 UTF-16 码元：3 个汉字不该算够 8 位。落单的代理项各算一个 */
const codePointLength = (text: string) => [...text].length

const LOGIN_REQUIRED = "请填写用户名和密码"

/** 登录页要用的这几条都不要求登录。e 站的绑定状态是 eh 的事，不在这里返回。 */
export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(maybeSignedIn)
  /* 登录页据此决定给不给注册入口，否则关了注册的站点上，用户要把表单填完提交了才知道注册不了 */
  .get("/options", () => authService.options())
  /*
   * 用户名限制成一眼能认的字符集，因为它会出现在 URL 和日志里；密码只卡长度、不强制复杂度——
   * 强制复杂度反而会逼出「Passw0rd!」这种可预测的密码。
   */
  .post("/register", ({ body }) => authService.register(body), {
    body: z.object({
      username: z.string({ error: USERNAME_RULE }).regex(/^[0-9A-Za-z_-]{3,32}$/, USERNAME_RULE),
      password: z
        .string({ error: "密码至少 8 位" })
        .refine((password) => codePointLength(password) >= 8, "密码至少 8 位")
        .refine((password) => codePointLength(password) <= 128, "密码最长 128 位"),
    }),
  })
  /*
   * 登录只要求两项都是字符串。用户名与密码的规则是注册时的事：不合规的输入本来就对不上任何账号，
   * 登录再卡一遍，只会让输错的人看到注册规则而不是「用户名或密码错误」，规则收紧后还会把早先注册的账号挡在门外。
   */
  .post("/login", ({ body }) => authService.login(body), {
    body: z.object({ username: z.string({ error: LOGIN_REQUIRED }), password: z.string({ error: LOGIN_REQUIRED }) }),
  })
  /* 当前登录者。未登录或账号已被删都是 200 的 null：前端拿 401 会跳登录页，而登录页自己也要问「我是谁」 */
  .get("/me", async ({ userId }) => (userId === null ? null : authService.find(userId)))
