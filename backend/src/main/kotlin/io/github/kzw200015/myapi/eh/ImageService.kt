package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.eh.upstream.Attachment
import io.github.kzw200015.myapi.eh.upstream.EhClient
import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import io.github.kzw200015.myapi.eh.upstream.ImageNodeFailure
import io.github.kzw200015.myapi.eh.upstream.checkPage
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/** 图片代理：签名校验通过才取图，交回可以直接转发的图片流，调用方负责关闭。 */
@Service
class ImageService(
    private val urls: ImageUrls,
    private val credentials: CredentialService,
    private val locator: ImageLocator,
    private val client: EhClient,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** 校验签名后用这个账号的凭据取图；图床节点失效时换源重试一次。 */
    fun openGalleryImage(userId: Long, ref: GalleryRef, page: Int, signature: Signature): Attachment {
        checkPage(page)
        urls.checkImage(userId, ref, signature)
        val access = credentials.access(userId)
        return try {
            client.openImage(locator.resolve(access, ref, page))
        } catch (e: ImageNodeFailure) {
            log.info("图床节点取图失败，换源重试 gid={} page={} status={}", ref.gid, page, e.status)
            client.openImage(locator.refresh(access, ref, page))
        }
    }

    /** 缩略图落在图床上，图床不认 e 站的 Cookie，取图与是谁在看无关，所以不需要账号。 */
    fun openThumbnail(encoded: String, signature: Signature): Attachment =
        client.openImage(urls.checkThumbnail(encoded, signature))
}
