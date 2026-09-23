import {
  gallerySearchSchema,
  type CursorPage,
  type GalleryCard,
  type GalleryComment,
  type GalleryDetailResult,
} from "@myapi/shared"
import { Injectable } from "@nestjs/common"
import type { z } from "zod"

import { AttachmentUrls } from "./attachment-urls.js"
import { CredentialService } from "./credential.service.js"
import { GalleryCatalog } from "./gallery-catalog.js"
import { ImageLocator } from "./image-locator.js"
import { ReadingService } from "./reading.service.js"
import { refKey, type GalleryRef } from "./upstream/access.js"
import { EhClient } from "./upstream/eh-client.js"
import { galleryMissing } from "./upstream/failures.js"
import { parseGalleryComments } from "./upstream/parse.js"

export type GallerySearch = z.output<typeof gallerySearchSchema>

/** 图集浏览：搜索 → 详情 → 评论。 */
@Injectable()
export class GalleryService {
  constructor(
    private readonly client: EhClient,
    private readonly credentials: CredentialService,
    private readonly catalog: GalleryCatalog,
    private readonly locator: ImageLocator,
    private readonly reading: ReadingService,
    private readonly urls: AttachmentUrls,
  ) {}

  /** 从列表页拿图集顺序和游标，再用元数据接口补全；元数据取不到的图集不出现在结果里。 */
  async search(userId: number, search: GallerySearch): Promise<CursorPage<GalleryCard>> {
    const access = await this.credentials.access(userId, search.site)
    const list = await this.client.search(access, search)
    const cards = await this.catalog.cards(list.refs)
    return {
      items: list.refs.flatMap((ref) => cards.get(refKey(ref)) ?? []),
      nextCursor: list.nextCursor,
    }
  }

  /** 详情只查一次元数据，评论另有接口懒加载；顺带签发这本图集的大图地址模板。阅读进度与元数据互不依赖，一起读。 */
  async detail(userId: number, ref: GalleryRef): Promise<GalleryDetailResult> {
    const [progress, galleries] = await Promise.all([
      this.reading.progressOf(userId, ref.gid),
      this.catalog.load([ref]),
    ])
    const gallery = galleries.get(refKey(ref))
    if (!gallery) {
      throw galleryMissing()
    }
    return { gallery: this.catalog.detail(gallery), progress, imageUrlTemplate: this.urls.imageTemplate(userId, ref) }
  }

  /** 评论是详情页 HTML 里唯一拿不到 JSON 替代的东西；它与取图共用详情的第 0 片。 */
  async comments(userId: number, ref: GalleryRef): Promise<GalleryComment[]> {
    const slice = await this.locator.gallerySlice(await this.credentials.access(userId), ref, 0)
    return parseGalleryComments(slice.html)
  }
}
