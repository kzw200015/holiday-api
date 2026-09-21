package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.upstream.EhClient
import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ImageServiceTest {
    private val signer = AttachmentSigner("test".toByteArray(), Duration.ofHours(1))
    private val urls = ImageUrls(signer)
    private val ref = GalleryRef(1, "0123456789")

    private fun service(client: EhClient) =
        ImageService(urls, CredentialService(InMemoryCredentials(), client, testJson), ImageLocator(client), client)

    /** 大图地址模板里签好的那一对参数。 */
    private fun signatureFor(userId: Long): Signature {
        val query = urls.imageTemplate(userId, ref).substringAfter('?').split('&')
            .associate { it.substringBefore('=') to it.substringAfter('=') }
        return Signature(query.getValue("e"), query.getValue("s"))
    }

    @Test
    fun `图床节点失败时换源重试一次`() {
        for (retryStatus in listOf(200, 403, 509)) {
            var imageRequests = 0
            var pageRequests = 0
            val responses = mutableListOf<FakeResponse>()
            val upstream = FakeUpstream { request ->
                when {
                    request.uri.path.startsWith("/g/") -> page("""<a href="/s/0123456789/1-1">page</a>""")
                    request.uri.path.startsWith("/s/") -> {
                        pageRequests++
                        if (pageRequests == 2) {
                            assertEquals("nl=page-one", request.uri.query, "换源没有使用当前页的令牌")
                        }
                        page("""<img id="img" src="https://ehgt.org/image.webp" onerror="nl('page-one')">""")
                    }

                    else -> {
                        imageRequests++
                        FakeResponse(
                            "image",
                            if (imageRequests == 2) retryStatus else 403,
                            "image/webp"
                        ).also(responses::add)
                    }
                }
            }
            val service = service(upstream.client())

            val result = runCatching { service.openGalleryImage(1, ref, 1, signatureFor(1)) }
            if (retryStatus == 200) {
                result.getOrThrow().close()
            } else {
                assertTrue(result.exceptionOrNull() is AppException, "失败响应被当成了图片")
            }
            assertEquals(2, imageRequests, "status $retryStatus")
            assertEquals(2, pageRequests, "status $retryStatus")
            assertTrue(responses.all { it.closes == 1 }, "每个响应体都要恰好关闭一次")
        }
    }

    @Test
    fun `签名覆盖了 uid，改地址上的 uid 冒充别人不行`() {
        val service = service(FakeUpstream { error("签名不对就不该出网") }.client())
        // 403 而不是 502：签名不对是本站自己的判断，跟 e 站有没有故障无关
        val failure =
            assertFailsWith<AppException.PermissionDenied> { service.openGalleryImage(8, ref, 3, signatureFor(7)) }
        assertTrue("签名不正确或已过期" in failure.message.orEmpty())
    }
}
