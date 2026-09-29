import { sql } from "drizzle-orm"
import { bigint, timestamp } from "drizzle-orm/pg-core"

/*
 * 各领域建表共用的列。表结构写在各自领域的 `*-tables.ts` 里，改了之后在 apps/server 下跑
 * `bunx drizzle-kit generate` 生成迁移，服务启动时自动执行。
 *
 * 约定：id 用 identity，是 bigint，按 number 取出（远小于 2^53）；业务上的唯一性用唯一索引表达。
 */

export const id = () => bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity()

/*
 * 时间只存到毫秒，与 JS 的 Date 一致，取出来就是 Date：库里要是存着微秒，取出来经 Date 一截，再交回数据库比较就对不上了。
 * 精度由列类型保证，写入时不管是 now() 还是别的，存进去都已经是毫秒。
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  /* 经 drizzle 的 update 改动一行时自动刷新；upsert 的冲突分支不走这里，要在 set 里自己写上。 */
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
}
