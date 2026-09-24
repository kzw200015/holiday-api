import type { Authenticated, Credentials, CurrentUser } from "@myapi/shared"
import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"
import { eq } from "drizzle-orm"
import { DatabaseError } from "pg"

import { hashPassword, verifyPassword } from "@/auth/passwords.js"
import type { Env } from "@/config.js"
import { DATABASE, type Database } from "@/database/database.module.js"
import { users } from "@/database/schema.js"

/** PostgreSQL 的唯一约束冲突 */
const UNIQUE_VIOLATION = "23505"

/** 本站账号：注册、登录与「我是谁」。 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** 是否开放注册。它是部署时的配置，前端打包时无从知道，只能来问。 */
  get registrationOpen(): boolean {
    return this.config.get("ALLOW_REGISTRATION", { infer: true })
  }

  /** 注册成功即登录。 */
  async register({ username, password }: Credentials): Promise<Authenticated> {
    if (!this.registrationOpen) {
      throw new BadRequestException("本站已关闭注册")
    }
    const passwordHash = await hashPassword(password)
    /* 判重交给唯一索引而不是先查再插：先查再插在两个并发请求之间是有窗口的 */
    let user: CurrentUser | undefined
    try {
      ;[user] = await this.db
        .insert(users)
        .values({ username, passwordHash })
        .returning({ id: users.id, username: users.username })
    } catch (error) {
      if (error instanceof Error && error.cause instanceof DatabaseError && error.cause.code === UNIQUE_VIOLATION) {
        throw new BadRequestException("用户名已被占用")
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
  async login({ username, password }: Credentials): Promise<Authenticated> {
    const [user] = await this.db.select().from(users).where(eq(users.username, username))
    if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) {
      throw new BadRequestException("用户名或密码错误")
    }
    return this.authenticated(user)
  }

  /** 账号已被删就按未登录处理，所以找不到是 null 而不是错误。 */
  async find(id: number): Promise<CurrentUser | null> {
    const [user] = await this.db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, id))
    return user ?? null
  }

  /**
   * 登录令牌是无状态的 JWT，前端自己保管、每次放进 Authorization 头。服务端不存已签发的令牌，
   * 所以没法强制踢掉某个会话，也就没有登出接口：退出登录就是前端把令牌丢掉。
   */
  private async authenticated(user: CurrentUser): Promise<Authenticated> {
    const token = await this.jwt.signAsync({ sub: String(user.id) })
    return { token, user: { id: user.id, username: user.username } }
  }
}
