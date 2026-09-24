import type {
  CursorPage,
  GalleryCard,
  GalleryComment,
  GalleryDetailResult,
  gallerySearchSchema,
} from "@myapi/shared/eh"
import { Injectable } from "@nestjs/common"
import type { z } from "zod"

import { AttachmentUrls } from "@/eh/attachment-urls"
import { CredentialService } from "@/eh/credential.service"
import { GalleryCatalog } from "@/eh/gallery-catalog"
import { ImageLocator } from "@/eh/image-locator"
import { ReadingService } from "@/eh/reading.service"
import { EhClient } from "@/eh/upstream/eh-client"
import { galleryMissing } from "@/eh/upstream/failures"
import { refKey, type GalleryRef } from "@/eh/upstream/gallery-ref"
import { parseGalleryComments } from "@/eh/upstream/parse"

/** 图集浏览：搜索 → 详情 → 评论。 */
@Injectable()
export class GalleryService {
  constructor(
    private readonly ehClient: EhClient,
    private readonly credentialService: CredentialService,
    private readonly galleryCatalog: GalleryCatalog,
    private readonly imageLocator: ImageLocator,
    private readonly readingService: ReadingService,
    private readonly attachmentUrls: AttachmentUrls,
  ) {}

  /** 从列表页拿图集顺序和游标，再用元数据接口补全；元数据取不到的图集不出现在结果里。 */
  async search(userId: number, search: z.output<typeof gallerySearchSchema>): Promise<CursorPage<GalleryCard>> {
    const access = await this.credentialService.access(userId)
    const list = await this.ehClient.search(access, search)
    const cards = await this.galleryCatalog.cards(list.refs)
    return {
      items: list.refs.flatMap((ref) => cards.get(refKey(ref)) ?? []),
      nextCursor: list.nextCursor,
    }
  }

  /** 详情只查一次元数据，评论另有接口懒加载；顺带签发这本图集的大图地址模板。阅读进度与元数据互不依赖，一起读。 */
  async detail(userId: number, ref: GalleryRef): Promise<GalleryDetailResult> {
    const [progress, gallery] = await Promise.all([
      this.readingService.progressOf(userId, ref.gid),
      this.galleryCatalog.detail(ref),
    ])
    if (!gallery) {
      throw galleryMissing()
    }
    return { gallery, progress, imageUrlTemplate: this.attachmentUrls.imageTemplate(userId, ref) }
  }

  /** 评论是详情页 HTML 里唯一拿不到 JSON 替代的东西；它与取图共用详情的第 0 片。 */
  async comments(userId: number, ref: GalleryRef): Promise<GalleryComment[]> {
    const slice = await this.imageLocator.gallerySlice(await this.credentialService.access(userId), ref, 0)
    return parseGalleryComments(slice.html)
  }
}
