package io.github.kzw200015.myapi.signing

import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component

@ConfigurationProperties("myapi")
data class SigningProperties(
    /**
     * 主密钥，登录令牌与图片地址的签名密钥都由它派生。
     *
     * 故意没有可用的默认值：数据库口令泄露只影响这一个库，签名密钥泄露则意味着任何人都能伪造任意账号的令牌。
     * 为空时绑定失败、进程拒绝启动。
     */
    val secretKey: String = "",
) {
    init {
        require(secretKey.isNotBlank()) {
            "缺少 myapi.secret-key（环境变量 MYAPI_SECRETKEY），用 `openssl rand -hex 32` 生成一个再启动"
        }
    }
}

/**
 * 按用途从主密钥派生的子密钥。
 *
 * 全局只配一把主密钥，但登录令牌与图片地址签名是两种用途：共用同一把裸密钥的话，任何一处的实现缺陷都会波及另一处。
 * 两把摆在这一处派生，才看得出有没有谁直接拿了主密钥。用途标签是密钥的一部分，改标签等于换密钥——
 * 已签发的令牌和已发出去的图片地址会一起失效。
 */
@Component
class SigningKeys(properties: SigningProperties) {
    val token: ByteArray = derive(properties.secretKey, "token-v1")
    val attachment: ByteArray = derive(properties.secretKey, "attachment-v1")
}

private fun derive(secretKey: String, purpose: String): ByteArray =
    MessageDigest.getInstance("SHA-256").digest("$secretKey:$purpose".toByteArray())

/** 用子密钥给一段内容签名。登录令牌与图片地址都用它，只是各自编码结果的方式不同。 */
fun hmacSha256(key: ByteArray, content: String): ByteArray =
    Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(content.toByteArray())
