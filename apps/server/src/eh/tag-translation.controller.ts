import type { TagTranslationStatus } from "@myapi/shared/eh"
import { Controller, Get, Post } from "@nestjs/common"

import { TagTranslationService } from "@/eh/tag-translation.service"

/** 标签译名的同步状态与手动同步。译名是全站共用的，任何登录的本站账号都能同步（见 ADR-0005）。 */
@Controller("eh/tag-translations")
export class TagTranslationController {
  constructor(private readonly tagTranslationService: TagTranslationService) {}

  @Get()
  status(): Promise<TagTranslationStatus> {
    return this.tagTranslationService.status()
  }

  /** 拉取与写入都完成才回，可能要十几秒；回的是同步后的状态。 */
  @Post("sync")
  sync(): Promise<TagTranslationStatus> {
    return this.tagTranslationService.sync()
  }
}
