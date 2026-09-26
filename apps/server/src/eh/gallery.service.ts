import * as attachmentUrls from "@server/eh/attachment-urls"
import * as credentialService from "@server/eh/credential.service"
import type { CursorPage } from "@server/eh/cursor-page"
import * as galleryCatalog from "@server/eh/gallery-catalog"
import * as imageLocator from "@server/eh/image-locator"
import * as ehClient from "@server/eh/upstream/eh-client"
import { galleryMissing } from "@server/eh/upstream/failures"
import { refKey, type GalleryRef } from "@server/eh/upstream/gallery-ref"
import type { GalleryComments, PreviewImage } from "@server/eh/upstream/parse"

/* 图集浏览：搜索 → 详情 → 评论与预览图。 */

/** 某一页大图的签名地址：每页各签各的，阅读器取哪页就签哪页 */
interface GalleryImageUrlResult {
  /** 直接给 img 的 src 用，前端不解析、不拼改它 */
  url: string
}

/** 图集里一页的预览图（尺寸与偏移的含义见 PreviewImage），地址签成了本站的代理地址 */
interface GalleryPreview extends Omit<PreviewImage, "imageUrl"> {
  url: string
}

/** 从列表页拿图集顺序和游标，再用元数据接口补全；元数据取不到的图集不出现在结果里。 */
export async function search(
  userId: number,
  criteria: ehClient.GallerySearch,
): Promise<CursorPage<galleryCatalog.GalleryCard>> {
  const access = await credentialService.access(userId)
  const list = await ehClient.search(access, criteria)
  const cards = await galleryCatalog.cards(list.refs)
  return {
    items: list.refs.flatMap((ref) => cards.get(refKey(ref)) ?? []),
    nextCursor: list.nextCursor,
  }
}

/** 详情只查一次元数据，评论另有接口懒加载，大图地址逐页另签。阅读进度另有接口（见 ADR-0006）。 */
export async function detail(ref: GalleryRef): Promise<galleryCatalog.GalleryDetail> {
  const gallery = await galleryCatalog.detail(ref)
  if (!gallery) {
    throw galleryMissing()
  }
  return gallery
}

/** 签一页大图的地址，不访问 e 站：图集在不在、页码对不对，取图时的定位自会回 404。 */
export function imageUrl(userId: number, ref: GalleryRef, page: number): GalleryImageUrlResult {
  return { url: attachmentUrls.image(userId, ref, page) }
}

/** 评论是详情页 HTML 里唯一拿不到 JSON 替代的东西；它与取图共用详情的第 0 片。 */
export async function comments(userId: number, ref: GalleryRef): Promise<GalleryComments> {
  const slice = await imageLocator.gallerySlice(await credentialService.access(userId), ref, 0)
  return slice.comments
}

/** 详情页某一片上的预览图，地址签成本站的代理地址。第 0 片与评论、取图共用。 */
export async function previews(userId: number, ref: GalleryRef, index: number): Promise<GalleryPreview[]> {
  const slice = await imageLocator.gallerySlice(await credentialService.access(userId), ref, index)
  return slice.previews.map(({ imageUrl: source, ...preview }) => ({
    ...preview,
    url: attachmentUrls.thumbnail(source),
  }))
}
