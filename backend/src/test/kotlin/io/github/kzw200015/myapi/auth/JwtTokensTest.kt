package io.github.kzw200015.myapi.auth

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class JwtTokensTest {
    private val key = "令牌子密钥".toByteArray()
    private val tokens = JwtTokens(key, Duration.ofHours(1))

    @Test
    fun `签发的令牌认得回来`() {
        assertEquals(7, tokens.read("Bearer ${tokens.issue(7)}"))
    }

    @Test
    fun `认不出的一律返回 null`() {
        val token = tokens.issue(7)
        val (header, payload, signature) = token.split('.')
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val forgedPayload = encoder.encodeToString("""{"sub":"8","exp":9999999999}""".toByteArray())
        val noneHeader = encoder.encodeToString("""{"alg":"none","typ":"JWT"}""".toByteArray())
        val cases = listOf(
            null,
            "",
            token,
            "Bearer ",
            "bearer $token",
            "Bearer garbage",
            "Bearer $header.$payload",
            // 改了载荷签名就对不上，否则拿到自己的令牌就能冒充别人
            "Bearer $header.$forgedPayload.$signature",
            // 头部自称不用签名也没用：从来不照令牌自称的算法去验
            "Bearer $noneHeader.$forgedPayload.",
            "Bearer ${JwtTokens("别的密钥".toByteArray(), Duration.ofHours(1)).issue(7)}",
        )
        for (authorization in cases) {
            assertNull(tokens.read(authorization), "$authorization 不该认得")
        }
    }

    @Test
    fun `过期的令牌不认`() {
        val issuedAt = Instant.parse("2026-01-01T00:00:00Z")
        val token = JwtTokens(key, Duration.ofHours(1), Clock.fixed(issuedAt, ZoneOffset.UTC)).issue(7)

        val later = JwtTokens(key, Duration.ofHours(1), Clock.fixed(issuedAt.plus(Duration.ofHours(2)), ZoneOffset.UTC))
        assertNull(later.read("Bearer $token"))
    }
}
