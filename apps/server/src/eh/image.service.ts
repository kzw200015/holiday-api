import { Injectable, Logger } from "@nestjs/common"

import { AttachmentUrls, type Signature } from "./attachment-urls.js"
import { CredentialService } from "./credential.service.js"
import { ImageLocator } from "./image-locator.js"
import type { GalleryRef } from "./upstream/access.js"
import { EhClient, type ImageStream } from "./upstream/eh-client.js"
import { ImageNodeFailure } from "./upstream/failures.js"

/** 图片代理：签名校验通过才取图，交回可以直接转发的图片流。 */
@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name)

  constructor(
    private readonly urls: AttachmentUrls,
    private readonly credentials: CredentialService,
    private readonly locator: ImageLocator,
    private readonly client: EhClient,
  ) {}

  /** 校验签名后用签发对象的凭据取图。uid 要等签名校验通过，才能拿它去读凭据。图床节点失败时换源重试一次。 */
  async openGalleryImage(userId: number, ref: GalleryRef, page: number, signature: Signature): Promise<ImageStream> {
    this.urls.checkImage(userId, ref, signature)
    const access = await this.credentials.access(userId)
    const image = await this.locator.locate(access, ref, page)
    try {
      return await this.client.openImage(image.imageUrl)
    } catch (error) {
      if (!(error instanceof ImageNodeFailure)) {
        throw error
      }
      this.logger.log(`图床节点取图失败，换源重试 gid=${ref.gid} page=${page} reason=${error.message}`)
      return this.client.openImage((await this.locator.relocate(access, ref, page, image)).imageUrl)
    }
  }

  /** 缩略图落在图床上，图床不认 e 站的 Cookie，取图与是谁在看无关，所以不需要账号。 */
  openThumbnail(encoded: string, signature: Signature): Promise<ImageStream> {
    return this.client.openImage(this.urls.checkThumbnail(encoded, signature))
  }
}
