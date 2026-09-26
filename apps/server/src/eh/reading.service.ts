import type { CursorPage, ReadingHistoryItem, readingProgressSchema } from "@myapi/shared/eh"
import { and, desc, eq, sql } from "drizzle-orm"
import type { z } from "zod"

import { database } from "@server/database/connection"
import { ehReadingProgress } from "@server/eh/eh.tables"
import * as galleryCatalog from "@server/eh/gallery-catalog"
import { encodeHistoryCursor, type HistoryCursor } from "@server/eh/history-cursor"
import { refKey } from "@server/eh/upstream/gallery-ref"

const PAGE_SIZE = 25

/*
 * 阅读进度与阅读历史：它们是同一张表，删一条阅读历史，对应的阅读进度也就没了。
 */
/**
 * 记下读到第几页。同一个图集只留一条，重复上报就覆盖；同一上报方的序号不比库里的新，就是迟到的旧上报，不写。
 * 冲突的那行会先被锁住，条件按它的最新版本判断，两次上报同时到也不会让旧的写进去。
 */
export async function save(userId: number, { gid, token, page, writer, seq }: z.output<typeof readingProgressSchema>) {
  await database
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
export async function progressOf(userId: number, gid: number): Promise<number | null> {
  const [row] = await database
    .select({ page: ehReadingProgress.page })
    .from(ehReadingProgress)
    .where(and(eq(ehReadingProgress.userId, userId), eq(ehReadingProgress.gid, gid)))
  return row?.page ?? null
}

/** 一页阅读历史，按最近阅读排序：记录来自本站的库，每条的展示信息再向上游补齐。before 为 null 是第一页。 */
export async function history(userId: number, before: HistoryCursor | null): Promise<CursorPage<ReadingHistoryItem>> {
  const rows = await database
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
  const cards = await galleryCatalog.cards(page)
  const last = page.at(-1)
  return {
    items: page.map((row) => ({
      gid: row.gid,
      token: row.token,
      page: row.page,
      readAt: row.updatedAt.toISOString(),
      gallery: cards.get(refKey(row)) ?? null,
    })),
    nextCursor: last && rows.length > PAGE_SIZE ? encodeHistoryCursor({ readAt: last.updatedAt, gid: last.gid }) : null,
  }
}

export async function remove(userId: number, gid: number) {
  await database
    .delete(ehReadingProgress)
    .where(and(eq(ehReadingProgress.userId, userId), eq(ehReadingProgress.gid, gid)))
}

export async function clear(userId: number) {
  await database.delete(ehReadingProgress).where(eq(ehReadingProgress.userId, userId))
}
