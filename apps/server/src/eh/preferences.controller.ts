import {
  galleryPreferencesPatchSchema,
  searchHistoryKeywordSchema,
  type galleryPreferencesSchema,
} from "@myapi/shared/eh"
import { Body, Controller, Delete, Get, Patch, Post, Query } from "@nestjs/common"
import type { z } from "zod"

import { CurrentUser } from "@/auth/auth.decorators"
import { PreferencesService } from "@/eh/preferences.service"

/**
 * 本站账号的浏览偏好与搜索历史。写接口都与到达顺序无关（见 ADR-0006）：偏好只改带来的字段，搜索历史一次记或删一个词，
 * 排序、去重、留几条由这边做。都只回成败，前端当场按同一条规则改好了本地那份。
 */
@Controller("eh")
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get("preferences")
  getPreferences(@CurrentUser() userId: number): Promise<z.output<typeof galleryPreferencesSchema>> {
    return this.preferencesService.preferences(userId)
  }

  @Patch("preferences")
  async patchPreferences(
    @CurrentUser() userId: number,
    @Body({ schema: galleryPreferencesPatchSchema }) patch: z.output<typeof galleryPreferencesPatchSchema>,
  ): Promise<void> {
    await this.preferencesService.patchPreferences(userId, patch)
  }

  @Get("search-history")
  searchHistory(@CurrentUser() userId: number): Promise<string[]> {
    return this.preferencesService.searchHistory(userId)
  }

  @Post("search-history")
  async recordSearch(
    @CurrentUser() userId: number,
    @Body({ schema: searchHistoryKeywordSchema }) { keyword }: z.output<typeof searchHistoryKeywordSchema>,
  ): Promise<void> {
    await this.preferencesService.recordSearch(userId, keyword)
  }

  /** 要删的词放查询串：它可能是 `..` 这类放进路径会被浏览器规范化掉的写法。 */
  @Delete("search-history/entry")
  async removeSearch(
    @CurrentUser() userId: number,
    @Query({ schema: searchHistoryKeywordSchema }) { keyword }: z.output<typeof searchHistoryKeywordSchema>,
  ): Promise<void> {
    await this.preferencesService.removeSearch(userId, keyword)
  }

  @Delete("search-history")
  async clearSearchHistory(@CurrentUser() userId: number): Promise<void> {
    await this.preferencesService.clearSearchHistory(userId)
  }
}
