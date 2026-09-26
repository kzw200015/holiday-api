import { sql } from "drizzle-orm"
import { bigint, timestamp } from "drizzle-orm/pg-core"

/*
 * 各领域建表共用的列。表结构写在各自领域的 `*-tables.ts` 里，改了之后在 apps/server 下跑
 * `bunx drizzle-kit generate` 生成迁移，服务启动时自动执行。
 *
 * 约定：id 用 identity；业务上的唯一性用唯一索引表达，它同时是各自 upsert 的冲突目标。
 * id 与 gid 是 bigint，按 number 取出：本站账号 id 与 e 站 gid 都远小于 2^53。
 */

export const id = () => bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity()
export const userId = () => bigint("user_id", { mode: "number" }).notNull()

/*
 * 时间只存到毫秒，与 JS 的 Date 一致，取出来就是 Date。阅读历史的游标要拿阅读时间原样交回数据库比较：
 * 库里要是存着微秒，经过 Date 截到毫秒再比，同一毫秒里的几行就会在翻页时漏掉。精度由列类型保证，
 * 写入时不管是 now() 还是别的，存进去都已经是毫秒。
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  /* 经 drizzle 的 update 改动一行时自动刷新；upsert 的冲突分支不走这里，要在 set 里自己写上。 */
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
}
