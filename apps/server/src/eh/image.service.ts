import * as attachmentUrls from "@server/eh/attachment-urls"
import type { Signature } from "@server/eh/attachment-urls"
import * as credentialService from "@server/eh/credential.service"
import * as imageLocator from "@server/eh/image-locator"
import * as ehClient from "@server/eh/upstream/eh-client"
import type { ImageStream } from "@server/eh/upstream/eh-client"
import { ImageNodeFailure } from "@server/eh/upstream/failures"
import type { GalleryRef } from "@server/eh/upstream/gallery-ref"
import { Logger } from "@server/logger"

/* 图片代理：签名校验通过才取图，交回可以直接转发的图片流。 */

const logger = new Logger("ImageService")

/** 校验签名后用签发对象的凭据取图。uid 要等签名校验通过，才能拿它去读凭据。图床节点失败时换源重试一次。 */
export async function openGalleryImage(
  userId: number,
  ref: GalleryRef,
  page: number,
  signature: Signature,
): Promise<ImageStream> {
  attachmentUrls.checkImage(userId, ref, page, signature)
  const access = await credentialService.access(userId)
  const image = await imageLocator.locate(access, ref, page)
  try {
    return await ehClient.openImage(image.imageUrl)
  } catch (error) {
    if (!(error instanceof ImageNodeFailure)) {
      throw error
    }
    /* 失败原因在创建 ImageNodeFailure 时已经连同地址记过了，这里记下是哪本哪页、按地址对得上 */
    logger.log(`图床节点取图失败，换源重试 gid=${ref.gid} page=${page} url=${image.imageUrl}`)
    return ehClient.openImage((await imageLocator.relocate(access, ref, page, image)).imageUrl)
  }
}

/** 缩略图落在图床上，图床不认 e 站的 Cookie，取图与是谁在看无关，所以不需要账号。 */
export function openThumbnail(encoded: string, signature: Signature): Promise<ImageStream> {
  return ehClient.openImage(attachmentUrls.checkThumbnail(encoded, signature))
}
