import { gallerySearchSchema, type GallerySearch } from "@myapi/shared"
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common"

import { CurrentUser } from "@/auth/auth.decorators.js"
import { GalleryService } from "@/eh/gallery.service.js"
import { galleryParams } from "@/eh/params.js"
import type { GalleryRef } from "@/eh/upstream/gallery-ref.js"

@Controller("eh/galleries")
export class GalleryController {
  constructor(private readonly galleries: GalleryService) {}

  /** 游标式分页。这是一次读取，走 POST 只是因为条件里有分类数组，所以回 200 而不是 201。 */
  @Post("search")
  @HttpCode(HttpStatus.OK)
  search(@CurrentUser() userId: number, @Body({ schema: gallerySearchSchema }) search: GallerySearch) {
    return this.galleries.search(userId, search)
  }

  @Get(":gid/:token")
  detail(@CurrentUser() userId: number, @Param({ schema: galleryParams }) ref: GalleryRef) {
    return this.galleries.detail(userId, ref)
  }

  /** 单独一次请求，不拖慢详情页首屏。 */
  @Get(":gid/:token/comments")
  comments(@CurrentUser() userId: number, @Param({ schema: galleryParams }) ref: GalleryRef) {
    return this.galleries.comments(userId, ref)
  }
}
