import { galleryPreferencesSchema, searchHistorySchema } from "@myapi/shared/eh"
import { Body, Controller, Get, Put } from "@nestjs/common"
import type { z } from "zod"

import { CurrentUser } from "@/auth/auth.decorators"
import { PreferencesService } from "@/eh/preferences.service"

/** 本站账号的浏览数据：读一次、之后前端说了算，写入一律整份 PUT，只回成败。 */
@Controller("eh")
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get("preferences")
  getPreferences(@CurrentUser() userId: number): Promise<z.output<typeof galleryPreferencesSchema>> {
    return this.preferencesService.preferences(userId)
  }

  @Put("preferences")
  async savePreferences(
    @CurrentUser() userId: number,
    @Body({ schema: galleryPreferencesSchema }) body: z.output<typeof galleryPreferencesSchema>,
  ): Promise<void> {
    await this.preferencesService.savePreferences(userId, body)
  }

  @Get("search-history")
  searchHistory(@CurrentUser() userId: number): Promise<string[]> {
    return this.preferencesService.searchHistory(userId)
  }

  @Put("search-history")
  async saveSearchHistory(
    @CurrentUser() userId: number,
    @Body({ schema: searchHistorySchema }) body: z.output<typeof searchHistorySchema>,
  ): Promise<void> {
    await this.preferencesService.saveSearchHistory(userId, body.entries)
  }
}
