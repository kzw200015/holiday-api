package io.github.kzw200015.myapi.auth

import kotlin.test.Test
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
}
