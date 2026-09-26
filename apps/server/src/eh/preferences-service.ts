import {
  DEFAULT_GALLERY_PREFERENCES,
  recordSearchKeyword,
  type GalleryCategory,
  type GalleryMinRating,
} from "@myapi/shared/eh"
import { eq, sql } from "drizzle-orm"

import { database } from "@server/database/connection"
import { ehPreferences } from "@server/eh/eh-tables"

/*
 * 浏览偏好与搜索历史，存在同一行。写入都与到达顺序无关（见 ADR-0006）：偏好只改带来的字段，
 * 搜索历史一次记或删一个词，在行锁下按共享包的同一条规则算出新列表。
 */
/** 浏览偏好：读接口的响应体。改偏好时每个字段都可省，只改带来的 */
interface GalleryPreferences {
  categories: GalleryCategory[]
  /** null 表示不限 */
  minRating: GalleryMinRating | null
  /** 自动翻页间隔，单位秒 */
  readerInterval: number
}

export async function preferences(userId: number): Promise<GalleryPreferences> {
  const [row] = await database
    .select({
      categories: ehPreferences.categories,
      minRating: ehPreferences.minRating,
      readerInterval: ehPreferences.readerInterval,
    })
    .from(ehPreferences)
    .where(eq(ehPreferences.userId, userId))
  return row ?? DEFAULT_GALLERY_PREFERENCES
}

/** 只改带来的字段，没带的保持原样；还没有这一行时，没带的落表上的默认值。分类排序去重后入库，存的始终是同一种写法。 */
export async function patchPreferences(
  userId: number,
  { categories, minRating, readerInterval }: Partial<GalleryPreferences>,
) {
  const value = {
    ...(categories && { categories: [...new Set(categories)].toSorted() }),
    ...(minRating !== undefined && { minRating }),
    ...(readerInterval !== undefined && { readerInterval }),
  }
  await database
    .insert(ehPreferences)
    .values({ userId, ...value })
    .onConflictDoUpdate({ target: ehPreferences.userId, set: { ...value, updatedAt: sql`now()` } })
}

export async function searchHistory(userId: number): Promise<string[]> {
  const [row] = await database
    .select({ searchHistory: ehPreferences.searchHistory })
    .from(ehPreferences)
    .where(eq(ehPreferences.userId, userId))
  return row?.searchHistory ?? []
}

/** 关键词原样存：前端提交前已经去过两端空白，这里再按另一套「空白」的定义去一遍，就会存下与前端不同的词。 */
export function recordSearch(userId: number, keyword: string) {
  return updateSearchHistory(userId, (entries) => recordSearchKeyword(entries, keyword))
}

export function removeSearch(userId: number, keyword: string) {
  return updateSearchHistory(userId, (entries) => entries.filter((entry) => entry !== keyword))
}

export function clearSearchHistory(userId: number) {
  return updateSearchHistory(userId, () => [])
}

/* 先确保有这一行，再锁住它读改写：同一账号同时来的几次改动排着队算，不会各自拿旧列表算完互相覆盖。 */
async function updateSearchHistory(userId: number, change: (entries: string[]) => string[]) {
  await database.transaction(async (tx) => {
    await tx.insert(ehPreferences).values({ userId }).onConflictDoNothing({ target: ehPreferences.userId })
    const [row] = await tx
      .select({ searchHistory: ehPreferences.searchHistory })
      .from(ehPreferences)
      .where(eq(ehPreferences.userId, userId))
      .for("update")
    await tx
      .update(ehPreferences)
      .set({ searchHistory: change(row?.searchHistory ?? []) })
      .where(eq(ehPreferences.userId, userId))
  })
}
