package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.eh.upstream.EhClient
import io.github.kzw200015.myapi.signing.SigningKeys
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpHeaders
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient
import tools.jackson.databind.json.JsonMapper
import java.net.http.HttpClient
import java.time.Duration

@ConfigurationProperties("myapi.eh")
data class EhProperties(
    /** 请求 e 站时伪装的 User-Agent。默认的 UA 在一个明确禁止自动化抓取的站点上等于举手，必须换成真实浏览器的。 */
    val userAgent: String = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    /** 单次请求 e 站的超时。页面偶尔很慢，但超过 30 秒基本就是不通了。 */
    val requestTimeout: Duration = Duration.ofSeconds(30),
    /**
     * 签名图片地址的有效期。这类地址是给 <img> 用的，带不了 Authorization 头，只能靠签名认身份；
     * 一旦被转发出去，在有效期内谁都能打开，所以别设太长。过期表现为图片裂开，重进详情页就会拿到新签的地址。
     */
    val attachmentTtl: Duration = Duration.ofHours(24),
)

@Configuration
class EhConfiguration {
    @Bean
    fun ehClient(properties: EhProperties, json: JsonMapper) = EhClient(
        RestClient.builder()
            // 不跟随重定向（JDK HttpClient 的默认）：里站 Cookie 无效时会 302 回表站，跟随的话会拿到一个「看起来正常」的
            // 表站页面；图片那条链路上它还多挡一层——白名单主机若被诱导 302 到内网，跟随就等于绕过了白名单
            .requestFactory(
                JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(properties.requestTimeout).build())
                    .apply { setReadTimeout(properties.requestTimeout) },
            )
            .defaultHeader(HttpHeaders.USER_AGENT, properties.userAgent)
            .build(),
        json,
    )

    @Bean
    fun attachmentSigner(keys: SigningKeys, properties: EhProperties) =
        AttachmentSigner(keys.attachment, properties.attachmentTtl)
}
