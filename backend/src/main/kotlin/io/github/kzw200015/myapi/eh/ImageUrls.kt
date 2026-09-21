package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import org.springframework.stereotype.Component
import java.util.*

/**
 * 两类图片地址的签发与校验。签发（拼进详情、列表的响应）和校验（图片接口读回来）写在同一处，
 * 两边哪天拼法不一致，表现就是所有图片突然打不开。
 */
@Component
class ImageUrls(private val signer: AttachmentSigner) {
    /** 缩略图：签的是上游原始地址，校验通过才代理，客户端指定不了主机。 */
    fun thumbnail(raw: String) =
        "/api/eh/thumbnail?u=${encoder.encodeToString(raw.toByteArray())}&${signer.sign(raw).query}"

    /** 大图地址模板：前端只把 {page} 换成页码，不必每页再问一次签名。 */
    fun imageTemplate(userId: Long, ref: GalleryRef) =
        "/api/eh/galleries/${ref.gid}/${ref.token}/pages/$PAGE_PLACEHOLDER/image?uid=$userId&" +
            signer.sign(imageSubject(userId, ref)).query

    /** 校验缩略图地址，交回上游原始地址。 */
    fun checkThumbnail(encoded: String, signature: Signature): String {
        val raw = runCatching { decoder.decode(encoded).decodeToString() }.getOrNull()
        if (raw == null || !signer.verify(raw, signature)) {
            throw AppException.PermissionDenied("缩略图地址签名不正确或已过期")
        }
        return raw
    }

    /** 签名覆盖了 uid：改地址上的 uid 冒充别人就对不上，否则拿到一条地址就能用别人的 e 站凭据取图。 */
    fun checkImage(userId: Long, ref: GalleryRef, signature: Signature) {
        if (!signer.verify(imageSubject(userId, ref), signature)) {
            throw AppException.PermissionDenied("图片地址签名不正确或已过期，回到详情页重进一次")
        }
    }

    private companion object {
        const val PAGE_PLACEHOLDER = "{page}"
        val encoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
        val decoder: Base64.Decoder = Base64.getUrlDecoder()

        /** 大图通行证签的是「谁能看哪个图集」，页码不在里面。 */
        fun imageSubject(userId: Long, ref: GalleryRef) = "$userId:${ref.gid}:${ref.token}"
    }
}
