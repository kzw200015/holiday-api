package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.signing.hmacSha256
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.util.HexFormat

/**
 * 地址上固定的两个签名参数：e 是毫秒时间戳，s 是签名值。
 *
 * 参数名和形状只在这里定死——签发端和校验端各写一份字面量的话，改名时漏一处的表现是所有图片一起 403。
 */
data class Signature(val expiresAt: String, val value: String) {
    val query: String get() = "e=$expiresAt&s=$value"

    companion object {
        /** 两项缺任何一项都算地址不完整；签名对不对不在这里判。 */
        fun of(expiresAt: String?, value: String?): Signature {
            if (expiresAt.isNullOrEmpty() || value.isNullOrEmpty()) {
                throw AppException.InvalidArgument("图片地址缺少签名参数")
            }
            return Signature(expiresAt, value)
        }
    }
}

/**
 * 给附件地址签名。
 *
 * 图片是浏览器的 <img src> 直接发起的请求，带不了 Authorization 头，也就拿不到登录令牌。所以附件不走令牌鉴权，
 * 改由服务端签发一个有时限的地址：签名覆盖「这是哪一份附件」加上过期时间，任何一个字节被改过都对不上。
 *
 * 签名截成 128 位。地址本身会出现在浏览器历史和转发日志里，签得再长也挡不住转发泄露，所以有效期才是重点。
 */
class AttachmentSigner(private val key: ByteArray, private val ttl: Duration, private val clock: Clock = Clock.systemUTC()) {
    /** 过期时间对齐到的粒度：有效期的四分之一。测试会传很短甚至负的有效期，那时退化成不对齐。 */
    private val bucketMillis = (ttl.toMillis() / 4).coerceAtLeast(1)

    /**
     * 过期时间不是精确的 now + ttl，而是往后对齐到窗口边界：同一个窗口里对同一 subject 签出的地址一模一样。
     * 图片接口靠 URL 命中浏览器缓存，每次签出一个毫秒级不同的地址的话，翻回去看一眼也得再消耗一次 e 站配额。
     * 代价是实际有效期比配置的多出最多四分之一，只会长不会短。
     */
    fun sign(subject: String): Signature {
        val expiresAt = Math.ceilDiv(clock.millis() + ttl.toMillis(), bucketMillis) * bucketMillis
        return Signature(expiresAt.toString(), digest(subject, expiresAt))
    }

    /** 签名与有效期都过才算数；垃圾输入返回 false 而不是抛出。 */
    fun verify(subject: String, signature: Signature): Boolean {
        val expiresAt = signature.expiresAt.toLongOrNull() ?: return false
        if (expiresAt <= clock.millis()) {
            return false
        }
        return MessageDigest.isEqual(signature.value.toByteArray(), digest(subject, expiresAt).toByteArray())
    }

    private fun digest(subject: String, expiresAt: Long): String =
        HexFormat.of().formatHex(hmacSha256(key, "$subject:$expiresAt"), 0, 16)
}
