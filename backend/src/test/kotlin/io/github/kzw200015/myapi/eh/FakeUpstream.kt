package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.eh.upstream.EhClient
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatusCode
import org.springframework.http.client.ClientHttpRequest
import org.springframework.http.client.ClientHttpRequestFactory
import org.springframework.http.client.ClientHttpResponse
import org.springframework.mock.http.client.MockClientHttpRequest
import org.springframework.mock.http.client.MockClientHttpResponse
import org.springframework.web.client.RestClient
import tools.jackson.module.kotlin.jacksonMapperBuilder
import java.io.ByteArrayInputStream
import java.net.URI
import java.util.concurrent.CopyOnWriteArrayList

/*
 * 假的 e 站：请求照样走完整的 EhClient 链路（拼地址、带 Cookie、判「200 但不是内容」），只在出网那一步换成内存响应，
 * 测试因此不依赖真实 e 站和账号。节假日数据源也借它换掉出网那一步。
 */

val testJson = jacksonMapperBuilder().build()

class FakeUpstream(private val respond: (MockClientHttpRequest) -> ClientHttpResponse) : ClientHttpRequestFactory {
    /** 按发出的顺序记下每个请求。 */
    val requests: MutableList<MockClientHttpRequest> = CopyOnWriteArrayList()

    override fun createRequest(uri: URI, httpMethod: HttpMethod): ClientHttpRequest =
        object : MockClientHttpRequest(httpMethod, uri) {
            override fun executeInternal(): ClientHttpResponse {
                requests += this
                return respond(this)
            }
        }

    /** 页面与取图两条出网通道都换成这一个。 */
    fun client(): EhClient {
        val rest = RestClient.builder().requestFactory(this).build()
        return EhClient(rest, rest, testJson)
    }
}

/** 一份内存响应；关闭次数记在 closes 上，用来验证响应体有没有被释放。 */
class FakeResponse(body: String, status: Int = 200, contentType: String = "text/html") :
    MockClientHttpResponse(ByteArrayInputStream(body.toByteArray()), HttpStatusCode.valueOf(status)) {
    var closes = 0
        private set

    init {
        headers.set(HttpHeaders.CONTENT_TYPE, contentType)
    }

    override fun close() {
        closes++
        super.close()
    }
}

fun page(body: String) = FakeResponse(body)

fun MockClientHttpRequest.cookie(name: String): String? =
    headers.getFirst(HttpHeaders.COOKIE)?.split("; ")?.firstOrNull { it.startsWith("$name=") }?.substringAfter('=')

fun fixture(name: String): String = FakeUpstream::class.java.getResource("/eh/$name")!!.readText()
