package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.auth.Public
import io.github.kzw200015.myapi.eh.upstream.Attachment
import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.web.bind.annotation.*
import org.springframework.web.util.DisconnectedClientHelper
import java.io.IOException
import java.time.Duration

/**
 * 两条图片接口。<img> 发的请求带不了 Authorization 头，所以它们不要求登录，改由地址里的签名认人——
 * 每条都自己校验签名，这一步不能省成「反正拦截器挡过了」。响应体是图片流而不是统一响应体。
 */
@Public
@RestController
@RequestMapping("/api/eh")
class ImageController(private val images: ImageService) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** 大图，地址形如 .../pages/{page}/image?uid=&e=&s=。uid 要等签名校验通过，才能拿它去读凭据。 */
    @GetMapping("/galleries/{gid}/{token}/pages/{page}/image")
    fun galleryImage(
        @PathVariable gid: Long,
        @PathVariable token: String,
        @PathVariable page: Int,
        @RequestParam uid: Long?,
        @RequestParam e: String?,
        @RequestParam s: String?,
        response: HttpServletResponse,
    ) {
        val ref = GalleryRef.of(gid, token)
        if (uid == null || uid <= 0) {
            throw AppException.InvalidArgument("用户标识不合法")
        }
        response.stream(images.openGalleryImage(uid, ref, page, Signature.of(e, s)))
    }

    /** 缩略图，地址形如 /thumbnail?u=&e=&s=，只接受本服务签发过的地址。 */
    @GetMapping("/thumbnail")
    fun thumbnail(
        @RequestParam u: String?,
        @RequestParam e: String?,
        @RequestParam s: String?,
        response: HttpServletResponse
    ) {
        if (u.isNullOrEmpty()) {
            throw AppException.InvalidArgument("缺少缩略图地址")
        }
        response.stream(images.openThumbnail(u, Signature.of(e, s)))
    }

    /** 边读边写，不把整张图读进内存。 */
    private fun HttpServletResponse.stream(attachment: Attachment) = attachment.use {
        contentType = it.contentType
        setHeader(HttpHeaders.CACHE_CONTROL, CACHE_CONTROL)
        it.contentLength?.let(::setContentLengthLong)
        try {
            it.body.transferTo(outputStream)
        } catch (e: IOException) {
            // 头已经发出去了，中途断了没法再改成错误响应，只能记一条日志。
            // 浏览器自己中止的（快速翻页时成批发生）不算故障，降到 debug，免得淹掉真正的上游断流
            if (DisconnectedClientHelper.isClientDisconnectedException(e)) {
                log.debug("客户端中途放弃了图片 url={}", it.source)
            } else {
                log.warn("转发图片时中断 url={}", it.source, e)
            }
        }
    }

    private companion object {
        /** 图集内容不会变，浏览器缓存住之后来回翻页就不再回源，也就不再消耗 e 站配额。 */
        val CACHE_CONTROL: String = CacheControl.maxAge(Duration.ofDays(30)).cachePrivate().immutable().headerValue!!
    }
}
