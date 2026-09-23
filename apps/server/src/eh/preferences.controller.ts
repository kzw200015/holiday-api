import { galleryPreferencesSchema, searchHistorySchema, type GalleryPreferences } from "@myapi/shared"
import { Body, Controller, Get, Put } from "@nestjs/common"
import type { z } from "zod"

import { CurrentUser } from "../auth/auth.decorators.js"
import { PreferencesService } from "./preferences.service.js"

/** 本站账号的浏览数据：读一次、之后前端说了算，写入一律整份 PUT，只回成败。 */
@Controller("api/eh")
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get("preferences")
  getPreferences(@CurrentUser() userId: number): Promise<GalleryPreferences> {
    return this.preferences.preferences(userId)
  }

  @Put("preferences")
  async savePreferences(
    @CurrentUser() userId: number,
    @Body({ schema: galleryPreferencesSchema }) body: GalleryPreferences,
  ): Promise<void> {
    await this.preferences.savePreferences(userId, body)
  }

  @Get("search-history")
  searchHistory(@CurrentUser() userId: number): Promise<string[]> {
    return this.preferences.searchHistory(userId)
  }

  @Put("search-history")
  async saveSearchHistory(
    @CurrentUser() userId: number,
    @Body({ schema: searchHistorySchema }) body: z.output<typeof searchHistorySchema>,
  ): Promise<void> {
    await this.preferences.saveSearchHistory(userId, body.entries)
  }
}
