import { bigint, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { timestamps } from "../db/timestamps"

/**
 * users 表结构。
 *
 * 用户名大小写敏感：Alice 和 alice 是两个不同的账号，登录也要求完全一致。
 * 所以这里是建在 username 上的普通唯一索引，查询用 eq() 就能走到。
 */
export const userTable = pgTable(
  "users",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    username: text().notNull(),
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_username_key").on(table.username)],
)

export type User = typeof userTable.$inferSelect

/**
 * 注册与登录的结果。
 *
 * 失败原因是直接展示给用户的文案，属于正常业务分支而不是异常，所以用返回值区分而不是抛错：
 * 抛出的 Error 会被 app.onError 统一转成 500，而「用户名已被占用」应该是 400。
 */
export type AuthResult = { ok: true; user: User } | { ok: false; msg: string }
