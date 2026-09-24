import { readingProgressSchema, type ReadingProgress } from "@myapi/shared/eh"
import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common"

import { CurrentUser } from "@/auth/auth.decorators.js"
import { readingHistoryQuery, type HistoryCursor } from "@/eh/history-cursor.js"
import { gidParam } from "@/eh/params.js"
import { ReadingService } from "@/eh/reading.service.js"

@Controller("eh")
export class ReadingController {
  constructor(private readonly readingService: ReadingService) {}

  /** 记下读到第几页。前端不排队、当场发出，靠上报方与序号挡住迟到的旧上报。 */
  @Post("progress")
  async saveProgress(
    @CurrentUser() userId: number,
    @Body({ schema: readingProgressSchema }) body: ReadingProgress,
  ): Promise<void> {
    await this.readingService.save(userId, body)
  }

  @Get("history")
  history(@CurrentUser() userId: number, @Query({ schema: readingHistoryQuery }) before: HistoryCursor | null) {
    return this.readingService.history(userId, before)
  }

  /** 按 gid 认记录，跟表上的唯一约束一致。 */
  @Delete("history/:gid")
  async remove(@CurrentUser() userId: number, @Param("gid", { schema: gidParam }) gid: number): Promise<void> {
    await this.readingService.remove(userId, gid)
  }

  @Delete("history")
  async clear(@CurrentUser() userId: number): Promise<void> {
    await this.readingService.clear(userId)
  }
}
