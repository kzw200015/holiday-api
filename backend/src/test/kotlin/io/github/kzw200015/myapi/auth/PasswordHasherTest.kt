package io.github.kzw200015.myapi.auth

import io.github.kzw200015.myapi.AppException
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PasswordHasherTest {
    private val hasher = PasswordHasher()

    /** Go 版（alexedwards/argon2id）生成的真实哈希：库是沿用的，旧账号的密码必须照样验得过。 */
    private val goHash =
        "\$argon2id\$v=19\$m=65536,t=2,p=1\$GWJ0cHAGWKo9G+ZbnLQTDA\$DoZHSlziwVSiiOUfmY5r/+Vzuq4jc9hK6gaeBrbid8c"

    @Test
    fun `验得过旧版生成的哈希`() {
        assertTrue(hasher.matches("correct horse 电池", goHash))
        assertFalse(hasher.matches("correct horse 电", goHash))
    }

    @Test
    fun `新建的哈希能验回来，同一个密码每次的盐都不同`() {
        val hash = hasher.hash("新密码 12345")
        assertTrue(hash.startsWith("\$argon2id\$v=19\$m=65536,t=2,p=1\$"))
        assertTrue(hasher.matches("新密码 12345", hash))
        assertFalse(hasher.matches("新密码 1234", hash))
        assertNotEquals(hash, hasher.hash("新密码 12345"))
    }

    @Test
    fun `账号不存在或哈希串坏了都当作不匹配`() {
        assertFalse(hasher.matches("随便什么", null))
        val wrongVariant = "\$argon2i\$v=19\$m=65536,t=2,p=1\$c2FsdA\$aGFzaA"
        val badParams = "\$argon2id\$v=19\$m=x,t=2,p=1\$c2FsdA\$aGFzaA"
        for (broken in listOf("", "plain", wrongVariant, badParams)) {
            assertFalse(hasher.matches("随便什么", broken), broken)
        }
    }

    /** 每算一次要占 64 MiB：同时在算的有上限，排不上又等太久的回「稍后再试」，而不是一直往上堆内存。 */
    @Test
    fun `同时在算的哈希有上限，排不上的等太久就放弃`() {
        val busy = PasswordHasher(queueTimeout = Duration.ofMillis(50))
        val taken = busy.permits.drainPermits()
        assertTrue(taken > 0)
        assertFailsWith<AppException.ResourceExhausted> { busy.matches("随便什么", goHash) }
        assertFailsWith<AppException.ResourceExhausted> { busy.hash("随便什么") }

        busy.permits.release(taken)
        assertTrue(busy.matches("correct horse 电池", goHash))
    }
}
