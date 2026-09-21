package io.github.kzw200015.myapi.auth

import io.github.kzw200015.myapi.signing.hmacSha256
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.util.Base64
import tools.jackson.databind.json.JsonMapper

/**
 * 无状态登录令牌：HS256 签名的 JWT，登录后交给前端自己保存，之后每个请求放进 Authorization 头。
 *
 * 服务端不存已签发的令牌，所以没法强制踢掉某个会话，只能等它过期；也因此没有 logout 接口，
 * 退出登录就是前端把令牌丢掉。真要全端下线，得在载荷里加一个账号级的版本号、每次校验时查库。
 * 由 AuthConfiguration 按配置组装。
 */
class JwtTokens(private val key: ByteArray, private val ttl: Duration, private val clock: Clock = Clock.systemUTC()) {
    fun issue(userId: Long): String {
        val expiresAt = clock.instant().plus(ttl).epochSecond
        val payload = encoder.encodeToString("""{"sub":"$userId","exp":$expiresAt}""".toByteArray())
        val unsigned = "$HEADER.$payload"
        return "$unsigned.${sign(unsigned)}"
    }

    /** 从 Authorization 头里认出登录者。没带令牌、签名不对、载荷坏了、已过期，一律返回 null 而不是报错。 */
    fun read(authorization: String?): Long? {
        val token = authorization?.takeIf { it.startsWith(BEARER) }?.removePrefix(BEARER) ?: return null
        val parts = token.split('.')
        if (parts.size != 3) {
            return null
        }
        // 签名覆盖了头部，而头部从来不读：照令牌自称的 alg 去验，等于让攻击者自己挑用哪把锁
        val expected = sign("${parts[0]}.${parts[1]}").toByteArray()
        if (!MessageDigest.isEqual(expected, parts[2].toByteArray())) {
            return null
        }
        val claims = runCatching { json.readTree(decoder.decode(parts[1])) }.getOrNull() ?: return null
        if (claims.path("exp").asLong(0) <= clock.instant().epochSecond) {
            return null
        }
        return claims.path("sub").asString("").toLongOrNull()?.takeIf { it > 0 }
    }

    private fun sign(content: String): String = encoder.encodeToString(hmacSha256(key, content))

    private companion object {
        const val BEARER = "Bearer "
        val encoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
        val decoder: Base64.Decoder = Base64.getUrlDecoder()
        val HEADER: String = encoder.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
        val json: JsonMapper = JsonMapper.shared()
    }
}
