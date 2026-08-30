import { eq } from "drizzle-orm"
import type { BunSQLDatabase } from "drizzle-orm/bun-sql"
import { logger } from "../logger"
import { type AuthResult, userTable, type User } from "./authModels"

export type AuthService = ReturnType<typeof createAuthService>

/**
 * 本站账号的注册与登录，直接操作 users 表，没有单独的数据访问层。
 *
 * 密码用 Bun 内置的 Bun.password（默认 argon2id，实测参数是 m=65536,t=2,p=1，
 * 单次校验约 43 毫秒），哈希串自带盐和参数，不需要额外的列，也不需要引第三方库。
 */
export function createAuthService({ db, allowRegistration }: { db: BunSQLDatabase; allowRegistration: boolean }) {
  return {
    /** 注册新账号。用户名大小写敏感地判重，成功后直接返回可用于签发会话的用户。 */
    async register(username: string, password: string): Promise<AuthResult> {
      if (!allowRegistration) {
        return { ok: false, msg: "本站已关闭注册" }
      }
      if (await findByUsername(username)) {
        return { ok: false, msg: "用户名已被占用" }
      }

      const passwordHash = await Bun.password.hash(password)
      const rows = await db.insert(userTable).values({ username, passwordHash }).returning()
      const user = rows[0]
      if (!user) {
        throw new Error("创建用户后没有拿到返回行")
      }

      logger.info({ userId: user.id, username: user.username }, "已注册新用户")
      return { ok: true, user }
    },

    /** 校验账号密码。 */
    async login(username: string, password: string): Promise<AuthResult> {
      const user = await findByUsername(username)
      // 用户不存在和密码不对返回同一句话，免得把「哪些用户名存在」透露出去
      if (!user || !(await Bun.password.verify(password, user.passwordHash))) {
        return { ok: false, msg: "用户名或密码错误" }
      }
      return { ok: true, user }
    },

    /** 按 id 取用户，供会话中间件还原当前登录者。找不到说明账号已被删，按未登录处理。 */
    async findUserById(id: number): Promise<User | null> {
      const rows = await db.select().from(userTable).where(eq(userTable.id, id)).limit(1)
      return rows[0] ?? null
    },
  }

  /** 按用户名查。大小写敏感，直接走 users_username_key 这个普通唯一索引。 */
  async function findByUsername(username: string): Promise<User | null> {
    const rows = await db.select().from(userTable).where(eq(userTable.username, username)).limit(1)
    return rows[0] ?? null
  }
}
