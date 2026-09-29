import * as attachmentUrls from "@server/eh/attachment-urls"
import * as credentialService from "@server/eh/credential-service"
import * as imageLocator from "@server/eh/image-locator"
import * as ehClient from "@server/eh/upstream/eh-client"
import { imageBroken, ImageNodeFailure } from "@server/eh/upstream/failures"
import type { GalleryRef } from "@server/eh/upstream/gallery-ref"
import { Logger } from "@server/logger"

/*
 * 图片代理：签名校验通过才取图，交回可以直接转发的图片流。
 *
 * 交回之前先等到第一段数据：一个字节都没传就断了的，还能改回普通的 502，不带图片的响应头（尤其是 30 天的缓存头）。
 * 已经开始发图之后再断，就只能让这个流出错、由 Bun 直接断开连接——照常收尾的话浏览器会把半张图当成完整的缓存下来。
 * 浏览器中途放弃（阅读器里快速翻页时成批发生）时取消上游，别在服务端把整张图白下完。
 */

const logger = new Logger(import.meta.url)

/** 校验签名后用签发对象的凭据取图。uid 要等签名校验通过，才能拿它去读凭据。图床节点失败时换源重试一次。 */
export async function openGalleryImage(
  userId: number,
  ref: GalleryRef,
  page: number,
  signature: attachmentUrls.Signature,
): Promise<ehClient.ImageStream> {
  attachmentUrls.checkImage(userId, ref, page, signature)
  const access = await credentialService.access(userId)
  const image = await imageLocator.locate(access, ref, page)
  try {
    return await started(await ehClient.openImage(image.imageUrl))
  } catch (error) {
    if (!(error instanceof ImageNodeFailure)) {
      throw error
    }
    /* 失败原因在创建 ImageNodeFailure 时已经连同地址记过了，这里记下是哪本哪页、按地址对得上 */
    logger.log(`图床节点取图失败，换源重试 gid=${ref.gid} page=${page} url=${image.imageUrl}`)
    return started(await ehClient.openImage((await imageLocator.relocate(access, ref, page, image)).imageUrl))
  }
}

/** 缩略图落在图床上，图床不认 e 站的 Cookie，取图与是谁在看无关，所以不需要账号。 */
export async function openThumbnail(
  encoded: string,
  signature: attachmentUrls.Signature,
): Promise<ehClient.ImageStream> {
  return started(await ehClient.openImage(attachmentUrls.checkThumbnail(encoded, signature)))
}

/** 等到第一段数据再交回；之后上游断了，交回的流随之出错。 */
async function started(image: ehClient.ImageStream): Promise<ehClient.ImageStream> {
  const reader = image.body.getReader()
  const first = await reader.read().catch((error: unknown) => {
    throw imageBroken(image.source, error)
  })
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) {
        controller.close()
      } else {
        controller.enqueue(first.value)
      }
    },
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          controller.close()
        } else {
          controller.enqueue(chunk.value)
        }
      } catch (error) {
        /* imageBroken 在创建时记日志，这里只用它记下这次失败 */
        controller.error(imageBroken(image.source, error))
      }
    },
    cancel(reason) {
      logger.debug(`客户端中途放弃了图片 url=${image.source} ${String(reason)}`)
      return reader.cancel(reason)
    },
  })
  return { ...image, body }
}
