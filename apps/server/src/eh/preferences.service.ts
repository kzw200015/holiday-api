import {
  DEFAULT_GALLERY_PREFERENCES,
  recordSearchKeyword,
  type galleryPreferencesPatchSchema,
  type galleryPreferencesSchema,
} from "@myapi/shared/eh"
import { Inject, Injectable } from "@nestjs/common"
import { eq, sql } from "drizzle-orm"
import type { z } from "zod"

import { DATABASE, type Database } from "@/database/database.module"
import { ehPreferences } from "@/eh/eh.tables"

/**
 * 浏览偏好与搜索历史，存在同一行。写入都与到达顺序无关（见 ADR-0006）：偏好只改带来的字段，
 * 搜索历史一次记或删一个词，在行锁下按共享包的同一条规则算出新列表。
 */
@Injectable()
export class PreferencesService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async preferences(userId: number): Promise<z.output<typeof galleryPreferencesSchema>> {
    const [row] = await this.database
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
  async patchPreferences(
    userId: number,
    { categories, minRating, readerInterval }: z.output<typeof galleryPreferencesPatchSchema>,
  ) {
    const value = {
      ...(categories && { categories: [...new Set(categories)].toSorted() }),
      ...(minRating !== undefined && { minRating }),
      ...(readerInterval !== undefined && { readerInterval }),
    }
    await this.database
      .insert(ehPreferences)
      .values({ userId, ...value })
      .onConflictDoUpdate({ target: ehPreferences.userId, set: { ...value, updatedAt: sql`now()` } })
  }

  async searchHistory(userId: number): Promise<string[]> {
    const [row] = await this.database
      .select({ searchHistory: ehPreferences.searchHistory })
      .from(ehPreferences)
      .where(eq(ehPreferences.userId, userId))
    return row?.searchHistory ?? []
  }

  /** 关键词原样存：前端提交前已经去过两端空白，这里再按另一套「空白」的定义去一遍，就会存下与前端不同的词。 */
  recordSearch(userId: number, keyword: string) {
    return this.updateSearchHistory(userId, (entries) => recordSearchKeyword(entries, keyword))
  }

  removeSearch(userId: number, keyword: string) {
    return this.updateSearchHistory(userId, (entries) => entries.filter((entry) => entry !== keyword))
  }

  clearSearchHistory(userId: number) {
    return this.updateSearchHistory(userId, () => [])
  }

  /* 先确保有这一行，再锁住它读改写：同一账号同时来的几次改动排着队算，不会各自拿旧列表算完互相覆盖。 */
  private async updateSearchHistory(userId: number, change: (entries: string[]) => string[]) {
    await this.database.transaction(async (tx) => {
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
}
