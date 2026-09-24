import type { GalleryCategory } from "@myapi/shared/eh"
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  type PgColumn,
} from "drizzle-orm/pg-core"

import { users } from "@/auth/auth.tables"
import { id, timestamps, userId } from "@/database/columns"

/* 外键沿用建库时 PostgreSQL 起的名字（表_列_fkey），迁移里才对得上现有的库。 */
const ownedByUser = (table: { userId: PgColumn }, name: string) =>
  foreignKey({ name: `${name}_user_id_fkey`, columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade")

/*
 * 每个本站账号绑定的 e 站 Cookie，一项一列，明文不加密——注册不开放，库里只有自己人的凭据。
 * 代价要认清：这几列等同于 e 站账号本身，数据库备份、从库、只读账号都要按凭据的标准对待。
 * igneous 是里站专用的，没有时存空串。
 */
export const ehCredentials = pgTable(
  "eh_credentials",
  {
    id: id(),
    userId: userId(),
    ipbMemberId: text("ipb_member_id").notNull(),
    ipbPassHash: text("ipb_pass_hash").notNull(),
    igneous: text().notNull(),
    hasExAccess: boolean("has_ex_access").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("eh_credentials_user_id_key").on(table.userId), ownedByUser(table, "eh_credentials")],
)

/*
 * 阅读进度，也是阅读历史：每个图集只留一条。
 * writer / seq 是最后一次写入的上报方（前端的一次页面加载）和它的上报序号：同一上报方迟到的旧序号不再覆盖，
 * 不同上报方之间照到达顺序覆盖——换成时间戳也比不了，各设备的时钟对不齐。
 */
export const ehReadingProgress = pgTable(
  "eh_reading_progress",
  {
    id: id(),
    userId: userId(),
    gid: bigint({ mode: "number" }).notNull(),
    token: text().notNull(),
    page: integer().notNull(),
    writer: text().notNull(),
    seq: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("eh_reading_progress_user_gid_key").on(table.userId, table.gid),
    ownedByUser(table, "eh_reading_progress"),
    /* 阅读历史按最近阅读分页，阅读时间相同时用 gid 保证顺序稳定 */
    index("eh_reading_progress_user_recent_idx").on(
      table.userId,
      table.updatedAt.desc().nullsFirst(),
      table.gid.desc().nullsFirst(),
    ),
  ],
)

/* 图集浏览偏好与最近搜索词，存在同一行、各自整份替换，互不覆盖。 */
export const ehPreferences = pgTable(
  "eh_preferences",
  {
    id: id(),
    userId: userId(),
    /* 列上不限定取值，分类名由写入口的共享 schema 把关 */
    categories: text()
      .array()
      .$type<GalleryCategory[]>()
      .notNull()
      .default(sql`'{}'`),
    readerInterval: integer("reader_interval").notNull().default(5),
    searchHistory: text("search_history")
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("eh_preferences_user_id_key").on(table.userId),
    ownedByUser(table, "eh_preferences"),
    check("eh_preferences_reader_interval_check", sql`${table.readerInterval} BETWEEN 1 AND 20`),
    check("eh_preferences_search_history_check", sql`CARDINALITY(${table.searchHistory}) <= 10`),
  ],
)
