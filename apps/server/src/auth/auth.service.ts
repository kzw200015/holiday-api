import type { Authenticated, credentialsSchema, CurrentUser, loginSchema } from "@myapi/shared/auth"
import { SQL } from "bun"
import { eq } from "drizzle-orm"
import type { z } from "zod"

import { users } from "@server/auth/auth.tables"
import { hashPassword, verifyPassword } from "@server/auth/passwords"
import type { Tokens } from "@server/auth/tokens"
import type { Database } from "@server/database/connection"
import { badRequest } from "@server/http-error"
import { Logger } from "@server/logger"

/** PostgreSQL 的唯一约束冲突。Bun 的 PostgresError 把 SQLSTATE 放在 errno 里，code 是 Bun 自己的错误码 */
const UNIQUE_VIOLATION = "23505"

/** 本站账号：注册、登录与「我是谁」。 */
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  private readonly database: Database
  private readonly tokens: Tokens
  /** 是否开放注册。它是部署时的配置，前端打包时无从知道，只能来问。 */
  readonly registrationOpen: boolean

  constructor(database: Database, tokens: Tokens, registrationOpen: boolean) {
    this.database = database
    this.tokens = tokens
    this.registrationOpen = registrationOpen
  }

  /** 注册成功即登录。 */
  async register({ username, password }: z.output<typeof credentialsSchema>): Promise<Authenticated> {
    if (!this.registrationOpen) {
      throw badRequest("本站已关闭注册")
    }
    const passwordHash = await hashPassword(password)
    /* 判重交给唯一索引而不是先查再插：先查再插在两个并发请求之间是有窗口的 */
    let user: CurrentUser | undefined
    try {
      ;[user] = await this.database
        .insert(users)
        .values({ username, passwordHash })
        .returning({ id: users.id, username: users.username })
    } catch (error) {
      if (
        error instanceof Error &&
        error.cause instanceof SQL.PostgresError &&
        error.cause.errno === UNIQUE_VIOLATION
      ) {
        throw badRequest("用户名已被占用")
      }
      throw error
    }
    /* 插入一行本该回一行，没回说明数据库那边出了意料之外的事，按服务器错误处理 */
    if (!user) {
      throw new Error("插入账号后没有拿到新建的那一行")
    }
    this.logger.log(`已注册新用户 userId=${user.id} username=${user.username}`)
    return this.authenticated(user)
  }

  /** 用户不存在与密码不对回同一句话，耗时也一样，不泄露哪些用户名存在。用户名大小写敏感。 */
  async login({ username, password }: z.output<typeof loginSchema>): Promise<Authenticated> {
    const [user] = await this.database.select().from(users).where(eq(users.username, username))
    if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) {
      throw badRequest("用户名或密码错误")
    }
    return this.authenticated(user)
  }

  /** 账号已被删就按未登录处理，所以找不到是 null 而不是错误。 */
  async find(id: number): Promise<CurrentUser | null> {
    const [user] = await this.database
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, id))
    return user ?? null
  }

  /** 登录令牌见 Tokens。 */
  private async authenticated(user: CurrentUser): Promise<Authenticated> {
    const token = await this.tokens.sign(user.id)
    return { token, user: { id: user.id, username: user.username } }
  }
}
