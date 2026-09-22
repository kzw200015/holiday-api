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

    /**
     * 边读边写，不把整张图读进内存。读上游和写给浏览器分开处理，两头断开的含义不一样：
     * 浏览器自己中止的（快速翻页时成批发生）不算故障；上游断流则不能照常收尾，见 [upstreamBroken]。
     */
    private fun HttpServletResponse.stream(attachment: Attachment) {
        attachment.use {
            contentType = it.contentType
            setHeader(HttpHeaders.CACHE_CONTROL, CACHE_CONTROL)
            it.contentLength?.let(::setContentLengthLong)
            val out = outputStream
            val buffer = ByteArray(BUFFER_SIZE)
            while (true) {
                val read = try {
                    it.body.read(buffer)
                } catch (e: IOException) {
                    throw upstreamBroken(it, e)
                }
                if (read < 0) {
                    return
                }
                try {
                    out.write(buffer, 0, read)
                } catch (_: IOException) {
                    log.debug("客户端中途放弃了图片 url={}", it.source)
                    return
                }
            }
        }
    }

    /**
     * 上游断流。头还没发出去，就撤掉图片的响应头（尤其是 30 天的缓存头），改回普通的错误响应；
     * 已经发出去了就改不成错误响应了，照常收尾的话浏览器会把半张图当成完整的缓存下来，
     * 所以原样抛出，由 ApiExceptionHandler 交给容器直接断开连接。
     */
    private fun HttpServletResponse.upstreamBroken(attachment: Attachment, cause: IOException): AppException {
        if (!isCommitted) {
            reset()
        }
        // 上游地址挂在 cause 上，只进日志
        return AppException.UpstreamFailure("图片传到一半，e 站那边断了", IOException("转发 ${attachment.source} 时中断", cause))
    }

    private companion object {
        const val BUFFER_SIZE = 16 * 1024

        /** 图集内容不会变，浏览器缓存住之后来回翻页就不再回源，也就不再消耗 e 站配额。 */
        val CACHE_CONTROL: String = CacheControl.maxAge(Duration.ofDays(30)).cachePrivate().immutable().headerValue!!
    }
}
