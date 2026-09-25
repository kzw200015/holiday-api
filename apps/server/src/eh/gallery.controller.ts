import { gallerySearchSchema } from "@myapi/shared/eh"
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common"
import type { z } from "zod"

import { CurrentUser } from "@/auth/auth.decorators"
import { GalleryService } from "@/eh/gallery.service"
import { galleryParams, gallerySliceParams } from "@/eh/params"
import type { GalleryRef } from "@/eh/upstream/gallery-ref"

@Controller("eh/galleries")
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  /** 游标式分页。这是一次读取，走 POST 只是因为条件里有分类数组，所以回 200 而不是 201。 */
  @Post("search")
  @HttpCode(HttpStatus.OK)
  search(
    @CurrentUser() userId: number,
    @Body({ schema: gallerySearchSchema }) search: z.output<typeof gallerySearchSchema>,
  ) {
    return this.galleryService.search(userId, search)
  }

  @Get(":gid/:token")
  detail(@CurrentUser() userId: number, @Param({ schema: galleryParams }) ref: GalleryRef) {
    return this.galleryService.detail(userId, ref)
  }

  /** 单独一次请求，不拖慢详情页首屏。 */
  @Get(":gid/:token/comments")
  comments(@CurrentUser() userId: number, @Param({ schema: galleryParams }) ref: GalleryRef) {
    return this.galleryService.comments(userId, ref)
  }

  /** 预览图按上游的分片取，详情页滚到哪一片才取哪一片。 */
  @Get(":gid/:token/previews/:slice")
  previews(
    @CurrentUser() userId: number,
    @Param({ schema: gallerySliceParams }) { gid, token, slice }: z.output<typeof gallerySliceParams>,
  ) {
    return this.galleryService.previews(userId, { gid, token }, slice)
  }
}
