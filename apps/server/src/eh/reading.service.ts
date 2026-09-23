import type { CursorPage, ReadingHistoryItem, ReadingProgress } from "@myapi/shared"
import { BadRequestException, Inject, Injectable } from "@nestjs/common"
import { and, desc, eq, sql } from "drizzle-orm"

import { DATABASE, type Database } from "../database/database.module.js"
import { ehReadingProgress } from "../database/schema.js"
import { GalleryCatalog } from "./gallery-catalog.js"
import { isDecimal } from "./params.js"
import { refKey } from "./upstream/access.js"

const PAGE_SIZE = 25

/**
 * 阅读进度与阅读历史：它们是同一张表，删一条阅读历史，对应的阅读进度也就没了。
 */
@Injectable()
export class ReadingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: GalleryCatalog,
  ) {}

  /**
   * 记下读到第几页。同一个图集只留一条，重复上报就覆盖；同一上报方的序号不比库里的新，就是迟到的旧上报，不写。
   * 冲突的那行会先被锁住，条件按它的最新版本判断，两次上报同时到也不会让旧的写进去。
   */
  async save(userId: number, { gid, token, page, writer, seq }: ReadingProgress) {
    await this.db
      .insert(ehReadingProgress)
      .values({ userId, gid, token, page, writer, seq })
      .onConflictDoUpdate({
        target: [ehReadingProgress.userId, ehReadingProgress.gid],
        set: {
          token: sql`excluded.token`,
          page: sql`excluded.page`,
          writer: sql`excluded.writer`,
          seq: sql`excluded.seq`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${ehReadingProgress.writer} <> excluded.writer OR ${ehReadingProgress.seq} < excluded.seq`,
      })
  }

  /** 这本读到第几页，没读过是 null。 */
  async progressOf(userId: number, gid: number): Promise<number | null> {
    const [row] = await this.db
      .select({ page: ehReadingProgress.page })
      .from(ehReadingProgress)
      .where(and(eq(ehReadingProgress.userId, userId), eq(ehReadingProgress.gid, gid)))
    return row?.page ?? null
  }

  /**
   * 一页阅读历史，按最近阅读排序：记录来自本站的库，每条的展示信息再向上游补齐。
   * 游标是上一页最后一条的阅读时间与 gid。时间按数据库给的字符串原样放进游标、原样交回数据库比较：
   * 转成 JS 的 Date 会把微秒截掉，同一毫秒里的几行就会在翻页时漏掉。
   */
  async history(userId: number, cursor: string): Promise<CursorPage<ReadingHistoryItem>> {
    const before = parseCursor(cursor)
    const rows = await this.db
      .select({
        gid: ehReadingProgress.gid,
        token: ehReadingProgress.token,
        page: ehReadingProgress.page,
        updatedAt: ehReadingProgress.updatedAt,
      })
      .from(ehReadingProgress)
      .where(
        and(
          eq(ehReadingProgress.userId, userId),
          before
            ? sql`(${ehReadingProgress.updatedAt}, ${ehReadingProgress.gid}) < (${before.readAt}::timestamptz, ${before.gid})`
            : undefined,
        ),
      )
      .orderBy(desc(ehReadingProgress.updatedAt), desc(ehReadingProgress.gid))
      /* 多取一条来判断还有没有下一页 */
      .limit(PAGE_SIZE + 1)
    const page = rows.slice(0, PAGE_SIZE)
    /* 整批元数据请求失败照常抛出：那是可以重试的错误，不能把网络故障伪装成所有图集都失效了 */
    const cards = await this.catalog.cards(page)
    const last = page.at(-1)
    return {
      items: page.map((row) => ({
        gid: row.gid,
        token: row.token,
        page: row.page,
        readAt: new Date(toIso(row.updatedAt)).toISOString(),
        gallery: cards.get(refKey(row)) ?? null,
      })),
      nextCursor: last && rows.length > PAGE_SIZE ? encodeCursor(last.updatedAt, last.gid) : null,
    }
  }

  async remove(userId: number, gid: number) {
    await this.db
      .delete(ehReadingProgress)
      .where(and(eq(ehReadingProgress.userId, userId), eq(ehReadingProgress.gid, gid)))
  }

  async clear(userId: number) {
    await this.db.delete(ehReadingProgress).where(eq(ehReadingProgress.userId, userId))
  }
}

/** PostgreSQL 输出的时间形如 `2026-09-24 01:02:03.123456+08`（时区偏移可能带分钟），交给数据库之前先认一认形状。 */
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/

function encodeCursor(readAt: string, gid: number): string {
  return Buffer.from(`${readAt},${gid}`).toString("base64url")
}

function parseCursor(cursor: string): { readAt: string; gid: number } | null {
  if (!cursor) {
    return null
  }
  const [readAt = "", gid = ""] = Buffer.from(cursor, "base64url").toString().split(",")
  if (!PG_TIMESTAMP.test(readAt) || !isDecimal(gid) || gid === "0") {
    throw new BadRequestException("阅读历史游标不合法")
  }
  return { readAt, gid: Number(gid) }
}

/** 把 PostgreSQL 的时间写法改成 ISO 8601，交给 Date 解析。 */
function toIso(timestamp: string): string {
  return timestamp.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")
}
