import type { CursorPage, ReadingHistoryItem, ReadingProgress } from "@myapi/shared"
import { Inject, Injectable } from "@nestjs/common"
import { and, desc, eq, sql } from "drizzle-orm"

import { DATABASE, type Database } from "@/database/database.module.js"
import { ehReadingProgress } from "@/eh/eh.tables.js"
import { GalleryCatalog } from "@/eh/gallery-catalog.js"
import { encodeHistoryCursor, type HistoryCursor } from "@/eh/history-cursor.js"
import { refKey } from "@/eh/upstream/gallery-ref.js"

const PAGE_SIZE = 25

/**
 * 阅读进度与阅读历史：它们是同一张表，删一条阅读历史，对应的阅读进度也就没了。
 */
@Injectable()
export class ReadingService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly galleryCatalog: GalleryCatalog,
  ) {}

  /**
   * 记下读到第几页。同一个图集只留一条，重复上报就覆盖；同一上报方的序号不比库里的新，就是迟到的旧上报，不写。
   * 冲突的那行会先被锁住，条件按它的最新版本判断，两次上报同时到也不会让旧的写进去。
   */
  async save(userId: number, { gid, token, page, writer, seq }: ReadingProgress) {
    await this.database
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
    const [row] = await this.database
      .select({ page: ehReadingProgress.page })
      .from(ehReadingProgress)
      .where(and(eq(ehReadingProgress.userId, userId), eq(ehReadingProgress.gid, gid)))
    return row?.page ?? null
  }

  /** 一页阅读历史，按最近阅读排序：记录来自本站的库，每条的展示信息再向上游补齐。before 为 null 是第一页。 */
  async history(userId: number, before: HistoryCursor | null): Promise<CursorPage<ReadingHistoryItem>> {
    const rows = await this.database
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
    const cards = await this.galleryCatalog.cards(page)
    const last = page.at(-1)
    return {
      items: page.map((row) => ({
        gid: row.gid,
        token: row.token,
        page: row.page,
        readAt: row.updatedAt.toISOString(),
        gallery: cards.get(refKey(row)) ?? null,
      })),
      nextCursor:
        last && rows.length > PAGE_SIZE ? encodeHistoryCursor({ readAt: last.updatedAt, gid: last.gid }) : null,
    }
  }

  async remove(userId: number, gid: number) {
    await this.database
      .delete(ehReadingProgress)
      .where(and(eq(ehReadingProgress.userId, userId), eq(ehReadingProgress.gid, gid)))
  }

  async clear(userId: number) {
    await this.database.delete(ehReadingProgress).where(eq(ehReadingProgress.userId, userId))
  }
}
