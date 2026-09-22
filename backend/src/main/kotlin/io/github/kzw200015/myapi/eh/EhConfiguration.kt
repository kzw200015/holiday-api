package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.eh.upstream.EhClient
import io.github.kzw200015.myapi.signing.SigningKeys
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpHeaders
import org.springframework.http.client.ClientHttpRequestFactory
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.web.client.RestClient
import tools.jackson.databind.json.JsonMapper
import java.net.HttpURLConnection
import java.net.http.HttpClient
import java.time.Duration

@ConfigurationProperties("myapi.eh")
data class EhProperties(
    /** 请求 e 站时伪装的 User-Agent。默认的 UA 在一个明确禁止自动化抓取的站点上等于举手，必须换成真实浏览器的。 */
    val userAgent: String = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    /**
     * 单次请求 e 站的超时。页面偶尔很慢，但超过 30 秒基本就是不通了。
     * 取图时按「多久没收到一个字节」算，不限整张图传多久。
     */
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
    fun ehClient(properties: EhProperties, json: JsonMapper): EhClient {
        fun client(requests: ClientHttpRequestFactory) = RestClient.builder()
            .requestFactory(requests)
            .defaultHeader(HttpHeaders.USER_AGENT, properties.userAgent)
            .build()
        return EhClient(
            // 不跟随重定向（JDK HttpClient 的默认）：里站 Cookie 无效时会 302 回表站，跟随的话会拿到一个「看起来正常」的表站页面
            client(
                JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(properties.requestTimeout).build())
                    .apply { setReadTimeout(properties.requestTimeout) },
            ),
            client(ImageRequestFactory(properties.requestTimeout)),
            json,
        )
    }

    @Bean
    fun attachmentSigner(keys: SigningKeys, properties: EhProperties) =
        AttachmentSigner(keys.attachment, properties.attachmentTtl)
}

/**
 * 取图专用的请求工厂：超时按「多久没收到一个字节」算，而不是整次请求的总时长。
 *
 * 图片是边读边转发给浏览器的，读得多快跟着浏览器的下载速度走。按总时长算的话（JDK HttpClient 那套就是，
 * 从发出请求开始计时，到点直接关掉响应体），弱网下一张大图传到一半就被掐断。HttpURLConnection 的读超时是套接字级的
 * 空闲超时，等响应头也算在内，正好是要的语义。
 */
internal class ImageRequestFactory(idleTimeout: Duration) : SimpleClientHttpRequestFactory() {
    init {
        // 图床节点是志愿者的机器，下线时多半连不上：早点放弃，才好换一台节点重试
        setConnectTimeout(minOf(CONNECT_TIMEOUT, idleTimeout))
        setReadTimeout(idleTimeout)
    }

    override fun prepareConnection(connection: HttpURLConnection, httpMethod: String) {
        super.prepareConnection(connection, httpMethod)
        // 父类对 GET 默认跟随重定向。白名单主机若被诱导 302 到内网，跟随就等于绕过了白名单
        connection.instanceFollowRedirects = false
    }

    private companion object {
        val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(10)
    }
}
