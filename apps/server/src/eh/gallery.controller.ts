import { gallerySearchSchema } from "@myapi/shared"
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common"
import type { z } from "zod"

import { CurrentUser } from "../auth/auth.decorators.js"
import { GalleryService, type GallerySearch } from "./gallery.service.js"
import { galleryParams } from "./params.js"

type GalleryParams = z.output<typeof galleryParams>

@Controller("api/eh/galleries")
export class GalleryController {
  constructor(private readonly galleries: GalleryService) {}

  /** 游标式分页。这是一次读取，走 POST 只是因为条件里有分类数组，所以回 200 而不是 201。 */
  @Post("search")
  @HttpCode(HttpStatus.OK)
  search(@CurrentUser() userId: number, @Body({ schema: gallerySearchSchema }) search: GallerySearch) {
    return this.galleries.search(userId, search)
  }

  @Get(":gid/:token")
  detail(@CurrentUser() userId: number, @Param({ schema: galleryParams }) ref: GalleryParams) {
    return this.galleries.detail(userId, ref)
  }

  /** 单独一次请求，不拖慢详情页首屏。 */
  @Get(":gid/:token/comments")
  comments(@CurrentUser() userId: number, @Param({ schema: galleryParams }) ref: GalleryParams) {
    return this.galleries.comments(userId, ref)
  }
}
