import { Hono } from "hono"
import { z } from "zod"
import { badRequest, ok } from "../apiresponse/apiResponse"
import { apiValidator } from "../web/apiValidator"
import type { User } from "./authModels"
import type { AuthService } from "./authService"
import type { SessionCookie } from "./sessionCookie"

/**
 * 注册与登录的入参。用户名限制成一眼能认的字符集，是因为它会出现在 URL 和日志里；
 * 密码只卡长度下限，不强制复杂度——强制复杂度反而会逼出「Passw0rd!」这种可预测的密码。
 */
const credentialSchema = z.object({
  username: z
    .string({ error: "用户名格式错误" })
    .regex(/^[0-9A-Za-z_-]{3,32}$/, { error: "用户名只能是 3 到 32 位的字母、数字、下划线或连字符" }),
  password: z.string({ error: "密码格式错误" }).min(8, { error: "密码至少 8 位" }).max(128, { error: "密码最长 128 位" }),
})

/** 当前登录者，未登录时为 null。 */
type CurrentUser = { id: number; username: string } | null

/**
 * 挑出能给前端看的那两列。三个接口都经这里，既保证字段一致，
 * 也是「passwordHash 绝不出现在响应体里」的唯一关口。
 */
function toCurrentUser(user: User): NonNullable<CurrentUser> {
  return { id: user.id, username: user.username }
}

/**
 * 本站账号相关的 HTTP 接口，挂载在 /api/auth 下。
 *
 * 这里不返回 e 站的绑定状态：那是 eh 模块的事，放在 GET /api/eh/credential，
 * 免得两个模块的类型互相缠住。
 */
export function createAuthController({
  authService,
  sessionCookie,
}: {
  authService: Pick<AuthService, "register" | "login" | "findUserById">
  sessionCookie: SessionCookie
}) {
  return (
    new Hono()
      /** POST /api/auth/register，注册成功即登录。用户名被占用或站点关闭注册时返回 400。 */
      .post("/register", apiValidator("json", credentialSchema), async (c) => {
        const { username, password } = c.req.valid("json")
        const result = await authService.register(username, password)
        if (!result.ok) {
          return c.json(badRequest(result.msg), 400)
        }
        await sessionCookie.issue(c, result.user.id)
        return c.json(ok(toCurrentUser(result.user)))
      })
      /** POST /api/auth/login，成功后下发会话 Cookie。 */
      .post("/login", apiValidator("json", credentialSchema), async (c) => {
        const { username, password } = c.req.valid("json")
        const result = await authService.login(username, password)
        if (!result.ok) {
          return c.json(badRequest(result.msg), 400)
        }
        await sessionCookie.issue(c, result.user.id)
        return c.json(ok(toCurrentUser(result.user)))
      })
      /** POST /api/auth/logout，未登录时调用也返回成功。 */
      .post("/logout", (c) => {
        sessionCookie.clear(c)
        return c.json(ok(null))
      })
      /**
       * GET /api/auth/me，返回当前登录者，未登录返回 data 为 null 的 200。
       * 这里刻意不回 401：前端的响应拦截器遇到 401 会跳登录页，而登录页自己也要问「我是谁」。
       */
      .get("/me", async (c) => {
        const userId = await sessionCookie.read(c)
        const user = userId === null ? null : await authService.findUserById(userId)
        if (!user) {
          // 会话有效但用户已被删除时，顺手把这张作废的 Cookie 清掉
          sessionCookie.clear(c)
          return c.json(ok<CurrentUser>(null))
        }
        return c.json(ok<CurrentUser>(toCurrentUser(user)))
      })
  )
}
