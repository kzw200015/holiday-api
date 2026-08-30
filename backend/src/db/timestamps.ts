import { timestamp } from "drizzle-orm/pg-core"

/**
 * 每张表都要有的 created_at / updated_at 两列，展开进 pgTable 使用：
 *
 * ```ts
 * export const fooTable = pgTable("foos", { name: text().notNull(), ...timestamps })
 * ```
 *
 * 时间由应用层生成而不是数据库默认值或触发器，所以数据库那边这两列没有 default——
 * 漏写会直接报错，而不是悄悄落一个别处填的时间。
 *
 * `$defaultFn` 管插入，`$onUpdate` 管更新，两者都由 Drizzle 在拼 SQL 时注入，
 * 连 upsert 的 `on conflict do update set` 也会带上 updated_at，所以调用处不用重复写。
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
}
