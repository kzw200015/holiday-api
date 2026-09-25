import type {
  CursorPage,
  GalleryCard,
  GalleryComments,
  GalleryDetail,
  GalleryImageUrlResult,
  GalleryPreview,
  gallerySearchSchema,
} from "@myapi/shared/eh"
import { Injectable } from "@nestjs/common"
import type { z } from "zod"

import { AttachmentUrls } from "@/eh/attachment-urls"
import { CredentialService } from "@/eh/credential.service"
import { GalleryCatalog } from "@/eh/gallery-catalog"
import { ImageLocator } from "@/eh/image-locator"
import { EhClient } from "@/eh/upstream/eh-client"
import { galleryMissing } from "@/eh/upstream/failures"
import { refKey, type GalleryRef } from "@/eh/upstream/gallery-ref"
import { parseGalleryComments, parseGalleryPreviews } from "@/eh/upstream/parse"

/** 图集浏览：搜索 → 详情 → 评论与预览图。 */
@Injectable()
export class GalleryService {
  constructor(
    private readonly ehClient: EhClient,
    private readonly credentialService: CredentialService,
    private readonly galleryCatalog: GalleryCatalog,
    private readonly imageLocator: ImageLocator,
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

  /** 详情只查一次元数据，评论另有接口懒加载，大图地址逐页另签。阅读进度另有接口（见 ADR-0006）。 */
  async detail(ref: GalleryRef): Promise<GalleryDetail> {
    const gallery = await this.galleryCatalog.detail(ref)
    if (!gallery) {
      throw galleryMissing()
    }
    return gallery
  }

  /** 签一页大图的地址，不访问 e 站：图集在不在、页码对不对，取图时的定位自会回 404。 */
  imageUrl(userId: number, ref: GalleryRef, page: number): GalleryImageUrlResult {
    return { url: this.attachmentUrls.image(userId, ref, page) }
  }

  /** 评论是详情页 HTML 里唯一拿不到 JSON 替代的东西；它与取图共用详情的第 0 片。 */
  async comments(userId: number, ref: GalleryRef): Promise<GalleryComments> {
    const slice = await this.imageLocator.gallerySlice(await this.credentialService.access(userId), ref, 0)
    return parseGalleryComments(slice.html)
  }

  /** 详情页某一片上的预览图，地址签成本站的代理地址。第 0 片与评论、取图共用。 */
  async previews(userId: number, ref: GalleryRef, index: number): Promise<GalleryPreview[]> {
    const slice = await this.imageLocator.gallerySlice(await this.credentialService.access(userId), ref, index)
    return parseGalleryPreviews(slice.html, ref.gid).map(({ imageUrl, ...preview }) => ({
      ...preview,
      url: this.attachmentUrls.thumbnail(imageUrl),
    }))
  }
}
