package io.github.kzw200015.myapi.auth

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters
import org.springframework.stereotype.Component

/**
 * argon2id 密码哈希，存成 PHC 串：`$argon2id$v=19$m=65536,t=2,p=1$<盐>$<哈希>`，盐和哈希是不带填充的标准 Base64。
 *
 * 校验时参数从串里读，所以改下面的参数只影响新建的密码，已有的哈希照样验得过。
 */
@Component
class PasswordHasher {
    fun hash(password: String): String {
        val salt = ByteArray(SALT_LENGTH).also(random::nextBytes)
        val params = Params(MEMORY_KB, ITERATIONS, PARALLELISM)
        val hash = derive(password, salt, params, KEY_LENGTH)
        return "\$argon2id\$v=19\$m=${params.memoryKb},t=${params.iterations},p=${params.parallelism}" +
            "\$${encoder.encodeToString(salt)}\$${encoder.encodeToString(hash)}"
    }

    /**
     * 核对密码。账号不存在时传 null：照样拿一个真实形状的哈希算一遍，否则响应快慢就把「哪些用户名存在」说出去了。
     * 哈希串坏了只当作不匹配。
     */
    fun matches(password: String, encoded: String?): Boolean {
        val phc = parse(encoded ?: DUMMY_HASH) ?: return false
        val actual = derive(password, phc.salt, phc.params, phc.hash.size)
        return MessageDigest.isEqual(actual, phc.hash) && encoded != null
    }

    private fun derive(password: String, salt: ByteArray, params: Params, length: Int): ByteArray {
        val generator = Argon2BytesGenerator()
        generator.init(
            Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                .withVersion(Argon2Parameters.ARGON2_VERSION_13)
                .withMemoryAsKB(params.memoryKb)
                .withIterations(params.iterations)
                .withParallelism(params.parallelism)
                .withSalt(salt)
                .build(),
        )
        return ByteArray(length).also { generator.generateBytes(password.toByteArray(), it) }
    }

    private fun parse(encoded: String): Phc? {
        val parts = encoded.split('$')
        if (parts.size != 6 || parts[0].isNotEmpty() || parts[1] != "argon2id" || parts[2] != "v=19") {
            return null
        }
        val settings = parts[3].split(',').associate { it.substringBefore('=') to it.substringAfter('=').toIntOrNull() }
        val params = Params(
            memoryKb = settings["m"] ?: return null,
            iterations = settings["t"] ?: return null,
            parallelism = settings["p"] ?: return null,
        )
        return runCatching { Phc(params, decoder.decode(parts[4]), decoder.decode(parts[5])) }.getOrNull()
    }

    private data class Params(val memoryKb: Int, val iterations: Int, val parallelism: Int)

    private class Phc(val params: Params, val salt: ByteArray, val hash: ByteArray)

    private companion object {
        // 单次校验约 40 毫秒
        const val MEMORY_KB = 64 * 1024
        const val ITERATIONS = 2
        const val PARALLELISM = 1
        const val SALT_LENGTH = 16
        const val KEY_LENGTH = 32

        /** 账号不存在时拿它顶上，好让校验耗时与真实账号一致。 */
        const val DUMMY_HASH = "\$argon2id\$v=19\$m=65536,t=2,p=1\$V3RDOUgDvIfDcjYEAIfghw\$" +
            "944XZMEceic4XWjgEwTPbYVHWIVkGO7WIRJgSrzMMgY"

        val random = SecureRandom()
        val encoder: Base64.Encoder = Base64.getEncoder().withoutPadding()
        val decoder: Base64.Decoder = Base64.getDecoder()
    }
}
