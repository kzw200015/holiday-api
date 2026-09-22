package io.github.kzw200015.myapi.eh

import com.sun.net.httpserver.HttpServer
import org.springframework.http.HttpMethod
import java.net.InetSocketAddress
import java.net.SocketTimeoutException
import java.net.URI
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** 取图的请求工厂：用本机起的真 HTTP 服务验证，超时与重定向的行为都在 JDK 的连接实现里，假响应测不出来。 */
class ImageRequestFactoryTest {
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply { start() }
    private val factory = ImageRequestFactory(Duration.ofMillis(500))

    /** 放行卡住的处理器：它跑在服务的分发线程上，stop 要等它返回。 */
    private val release = CountDownLatch(1)

    @AfterTest
    fun stop() {
        release.countDown()
        server.stop(0)
    }

    private fun url(path: String) = URI("http://127.0.0.1:${server.address.port}$path")

    @Test
    fun `不跟随重定向，白名单主机没法把请求引到别处`() {
        val followed = AtomicInteger()
        server.createContext("/redirect") { exchange ->
            exchange.responseHeaders.add("Location", url("/internal").toString())
            exchange.sendResponseHeaders(302, -1)
            exchange.close()
        }
        server.createContext("/internal") { exchange ->
            followed.incrementAndGet()
            exchange.sendResponseHeaders(200, -1)
            exchange.close()
        }

        factory.createRequest(url("/redirect"), HttpMethod.GET).execute().use { response ->
            assertEquals(302, response.statusCode.value())
        }
        assertEquals(0, followed.get())
    }

    /** 图片边读边转发给浏览器，整张传多久跟着浏览器的网速走：只要一直有字节进来就不该被掐断。 */
    @Test
    fun `超时按空闲时间算，总时长超过超时也照样读完`() {
        server.createContext("/slow") { exchange ->
            exchange.sendResponseHeaders(200, 0)
            exchange.responseBody.use { body ->
                repeat(8) {
                    body.write(ByteArray(1024))
                    body.flush()
                    Thread.sleep(150)
                }
            }
        }

        factory.createRequest(url("/slow"), HttpMethod.GET).execute().use { response ->
            assertEquals(8 * 1024, response.body.readAllBytes().size)
        }
    }

    @Test
    fun `一直没有字节进来就超时`() {
        server.createContext("/stalled") { exchange ->
            exchange.sendResponseHeaders(200, 0)
            exchange.responseBody.write(ByteArray(10))
            exchange.responseBody.flush()
            release.await(5, TimeUnit.SECONDS)
            exchange.close()
        }

        factory.createRequest(url("/stalled"), HttpMethod.GET).execute().use { response ->
            assertFailsWith<SocketTimeoutException> { response.body.readAllBytes() }
        }
    }
}
