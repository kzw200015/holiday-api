import type { AttachmentUrls, Signature } from "@server/eh/attachment-urls"
import type { CredentialService } from "@server/eh/credential.service"
import type { ImageLocator } from "@server/eh/image-locator"
import type { EhClient, ImageStream } from "@server/eh/upstream/eh-client"
import { ImageNodeFailure } from "@server/eh/upstream/failures"
import type { GalleryRef } from "@server/eh/upstream/gallery-ref"
import { Logger } from "@server/logger"

/** 图片代理：签名校验通过才取图，交回可以直接转发的图片流。 */
export class ImageService {
  private readonly logger = new Logger(ImageService.name)

  private readonly attachmentUrls: AttachmentUrls
  private readonly credentialService: CredentialService
  private readonly imageLocator: ImageLocator
  private readonly ehClient: EhClient

  constructor(
    attachmentUrls: AttachmentUrls,
    credentialService: CredentialService,
    imageLocator: ImageLocator,
    ehClient: EhClient,
  ) {
    this.attachmentUrls = attachmentUrls
    this.credentialService = credentialService
    this.imageLocator = imageLocator
    this.ehClient = ehClient
  }

  /** 校验签名后用签发对象的凭据取图。uid 要等签名校验通过，才能拿它去读凭据。图床节点失败时换源重试一次。 */
  async openGalleryImage(userId: number, ref: GalleryRef, page: number, signature: Signature): Promise<ImageStream> {
    this.attachmentUrls.checkImage(userId, ref, page, signature)
    const access = await this.credentialService.access(userId)
    const image = await this.imageLocator.locate(access, ref, page)
    try {
      return await this.ehClient.openImage(image.imageUrl)
    } catch (error) {
      if (!(error instanceof ImageNodeFailure)) {
        throw error
      }
      /* 失败原因在创建 ImageNodeFailure 时已经连同地址记过了，这里记下是哪本哪页、按地址对得上 */
      this.logger.log(`图床节点取图失败，换源重试 gid=${ref.gid} page=${page} url=${image.imageUrl}`)
      return this.ehClient.openImage((await this.imageLocator.relocate(access, ref, page, image)).imageUrl)
    }
  }

  /** 缩略图落在图床上，图床不认 e 站的 Cookie，取图与是谁在看无关，所以不需要账号。 */
  openThumbnail(encoded: string, signature: Signature): Promise<ImageStream> {
    return this.ehClient.openImage(this.attachmentUrls.checkThumbnail(encoded, signature))
  }
}
