import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import { id, timestamps } from "@/database/columns"

export const users = pgTable(
  "users",
  {
    id: id(),
    username: text().notNull(),
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  /* 用户名大小写敏感：Alice 和 alice 是两个账号，所以是建在列上的普通唯一索引。 */
  (table) => [uniqueIndex("users_username_key").on(table.username)],
)
