import { DEFAULT_GALLERY_PREFERENCES, type GalleryPreferences } from "@myapi/shared"
import { Inject, Injectable } from "@nestjs/common"
import { eq, sql } from "drizzle-orm"

import { DATABASE, type Database } from "@/database/database.module.js"
import { ehPreferences } from "@/eh/eh.tables.js"

/**
 * 浏览偏好与搜索历史：「读一次、之后前端说了算」，所以写入一律是整份替换——前端推上来的就是它当前的样子，
 * 这边只做落不进库才需要拦的校验（由共享 schema 在控制器入口完成），然后存住。两份存在同一行，各自 upsert、互不覆盖。
 *
 * 写入只回成败，不回存下来的那一份：前端以本地那份为准。整份提交意味着按到达顺序覆盖，另一台设备刚改的会被盖掉，
 * 这是拿本地当真源换来的。
 */
@Injectable()
export class PreferencesService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async preferences(userId: number): Promise<GalleryPreferences> {
    const [row] = await this.database
      .select({ categories: ehPreferences.categories, readerInterval: ehPreferences.readerInterval })
      .from(ehPreferences)
      .where(eq(ehPreferences.userId, userId))
    return row ?? DEFAULT_GALLERY_PREFERENCES
  }

  /** 分类排序去重后入库，存的始终是同一种写法。 */
  async savePreferences(userId: number, { categories, readerInterval }: GalleryPreferences) {
    const value = { categories: [...new Set(categories)].toSorted(), readerInterval }
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

  /**
   * 哪条在前、要不要去重、留几条都是前端定的，关键词也原样存：前端提交前已经去过两端空白，
   * 这里再按另一套「空白」的定义去一遍，就会存下与前端不同的词。
   */
  async saveSearchHistory(userId: number, entries: string[]) {
    await this.database
      .insert(ehPreferences)
      .values({ userId, searchHistory: entries })
      .onConflictDoUpdate({
        target: ehPreferences.userId,
        set: { searchHistory: entries, updatedAt: sql`now()` },
      })
  }
}
