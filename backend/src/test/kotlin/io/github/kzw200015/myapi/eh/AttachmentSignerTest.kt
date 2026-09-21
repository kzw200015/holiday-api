package io.github.kzw200015.myapi.eh

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * 签名地址是图片接口唯一的鉴权手段——那两条接口不要求登录，签名过了就给图，
 * 所以这里的每个用例都对应一种「本不该放行却放行了」的后果。
 */
class AttachmentSignerTest {
    private val key = "子密钥".toByteArray()
    private val signer = AttachmentSigner(key, Duration.ofMinutes(1))

    @Test
    fun `自己签的地址能通过校验`() {
        val subject = "https://ehgt.org/x.webp"
        assertTrue(signer.verify(subject, signer.sign(subject)))
    }

    @Test
    fun `换一个 subject 就通不过`() {
        // 否则拿到自己那张图的签名，就能改改地址去拉别的东西
        val signature = signer.sign("7:2231376:a7584a5932")
        assertFalse(signer.verify("8:2231376:a7584a5932", signature))
        assertFalse(signer.verify("7:2231377:a7584a5932", signature))
    }

    @Test
    fun `改过期时间就通不过`() {
        // 过期时间也在签名里，不然把 e 往后改一改就是一张永久通行证
        val signature = signer.sign("原文")
        assertFalse(
            signer.verify(
                "原文",
                signature.copy(expiresAt = (signature.expiresAt.toLong() + 60_000).toString())
            )
        )
    }

    @Test
    fun `已经过期的地址不放行`() {
        val expired = AttachmentSigner(key, Duration.ofSeconds(-1))
        assertFalse(expired.verify("原文", expired.sign("原文")))
    }

    @Test
    fun `换一把密钥签的地址不认`() {
        val other = AttachmentSigner("别的密钥".toByteArray(), Duration.ofMinutes(1))
        assertFalse(signer.verify("原文", other.sign("原文")))
    }

    @Test
    fun `同一窗口里签出的地址一模一样，且有效期不短于配置值`() {
        // 否则浏览器永远命不中缓存，翻回去看一眼缩略图也要再消耗一次 e 站配额。
        // 窗口是有效期的四分之一（15 分钟）；起点刻意不落在整刻上，正好压在窗口边界的时刻本来就属于前一个窗口
        val base = Instant.parse("2026-09-05T10:01:00Z")
        fun at(instant: Instant) = AttachmentSigner(key, Duration.ofHours(1), Clock.fixed(instant, ZoneOffset.UTC))

        val first = at(base).sign("原文")
        assertEquals(first, at(base.plus(Duration.ofMinutes(10))).sign("原文"))
        assertTrue(first.expiresAt.toLong() >= base.plus(Duration.ofHours(1)).toEpochMilli())
    }

    @Test
    fun `垃圾输入返回 false 而不是崩掉`() {
        val future = (System.currentTimeMillis() + 60_000).toString()
        val garbage = listOf(
            Signature("", ""),
            Signature("abc", "deadbeef"),
            Signature(future, ""),
            Signature(future, "0"),
            Signature("NaN", "0"),
            Signature("1e999", "0"),
        )
        for (signature in garbage) {
            assertFalse(signer.verify("原文", signature), "$signature 不该通过")
        }
    }
}
