package io.github.kzw200015.myapi.eh.upstream

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.FakeResponse
import io.github.kzw200015.myapi.eh.FakeUpstream
import io.github.kzw200015.myapi.eh.page
import java.io.IOException
import kotlin.reflect.KClass
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EhClientTest {
    /**
     * 「200 但不是你要的东西」有好几种，全都必须识别出来：只看状态码的话，IP 被封时会被当成正常页面解析出空列表，
     * 然后继续按原节奏请求，把临时封禁续成长期封禁。
     */
    @Test
    fun `识别上游那些看起来正常的失败`() {
        val client = FakeUpstream { page("") }.client()
        val cases: List<Triple<Int, String, KClass<out AppException>?>> = listOf(
            Triple(509, "whatever", AppException.ResourceExhausted::class),
            // 509 的响应体也可能是空的，先判状态码才能给出准确的提示
            Triple(509, "", AppException.ResourceExhausted::class),
            // 里站 Cookie 无效时回 200 加空 body，不是 403
            Triple(200, "", AppException.InvalidArgument::class),
            Triple(200, "   \n  ", AppException.InvalidArgument::class),
            Triple(200, "Your IP address has been temporarily banned", AppException.ResourceExhausted::class),
            Triple(200, "detected excessive pageloads", AppException.ResourceExhausted::class),
            Triple(200, "<h1>Content Warning</h1>", AppException.UpstreamFailure::class),
            // 正常的页面请求不会重定向，会重定向说明身份没被认下来
            Triple(302, "<html>go away</html>", AppException.UpstreamFailure::class),
            // 搜索没命中是正常页面，交给解析器返回空列表
            Triple(200, "<p>No hits found</p>", null),
            Triple(200, """<table class="itg">...</table>""", null),
        )
        for ((status, body, expected) in cases) {
            val failure = runCatching { client.assertUsable(status, body, "https://e-hentai.org/") }.exceptionOrNull()
            assertEquals(expected, failure?.let { it::class }, "assertUsable($status, \"$body\")")
        }
    }

    /** 图片主机白名单是图片代理唯一的 SSRF 防线。这里列的绕过手法都是真会被人试的。 */
    @Test
    fun `图片主机白名单`() {
        val allowed = listOf(
            "https://ehgt.org/w/02/611/26694-ftjxzayd.webp",
            // H@H 节点用的是非标准端口，端口不能限制死
            "https://bvxhifw.isvxwqkwpklu.hath.network:62121/h/abc/keystamp=1-2/x.webp",
            "https://x.hath.network/h/abc/x.jpg",
        )
        for (url in allowed) {
            assertTrue(isAllowedImageUrl(url), "应当放行 $url")
        }

        val blocked = listOf(
            // 伪装成白名单的域名：把它放在前缀里，或者少一个点
            "https://ehgt.org.attacker.com/x.jpg",
            "https://evilhath.network/x.jpg",
            "https://attacker.com/ehgt.org/x.jpg",
            "https://ehgt.org.evil/x.jpg",
            // 内网地址与非 https 协议
            "http://ehgt.org/x.jpg",
            "https://127.0.0.1/x.jpg",
            "https://localhost:5432/x.jpg",
            "https://localhost/x.jpg",
            "file:///etc/passwd",
            "http://169.254.169.254/latest/meta-data/",
            // user@host 这种形式能让粗心的主机名判断认错域
            "https://ehgt.org@attacker.com/x.jpg",
            "https://user:pass@ehgt.org/x.jpg",
            // 根本不是地址
            "", "不是地址", "//ehgt.org/x.jpg", "javascript:alert(1)",
        )
        for (url in blocked) {
            assertFalse(isAllowedImageUrl(url), "应当拒绝 $url")
        }
    }

    @Test
    fun `取图成功时交出图片流，失败时自己关掉响应`() {
        data class Case(val status: Int, val contentType: String, val failure: KClass<out AppException>?, val retryable: Boolean)
        val cases = listOf(
            Case(200, "image/webp", null, false),
            // 节点失败允许大图换一台节点重试
            Case(403, "image/webp", AppException.UpstreamFailure::class, true),
            Case(509, "text/html", AppException.ResourceExhausted::class, false),
            // 上游出错时回的是 HTML 错误页，原样转发会让浏览器显示一张裂图
            Case(200, "text/html", AppException.UpstreamFailure::class, false),
        )
        for (case in cases) {
            val response = FakeResponse("image", case.status, case.contentType)
            val upstream = FakeUpstream { response }
            val result = runCatching { upstream.client().openImage("https://ehgt.org/image.webp") }

            // 图床不认 e 站的身份，发过去只是白白泄露给第三方主机
            assertNull(upstream.requests.single().headers.getFirst("Cookie"), "图床请求携带了凭据")
            if (case.failure == null) {
                val image = result.getOrThrow()
                assertEquals(0, response.closes, "成功的图片流不该被提前关掉")
                image.use { assertEquals("image", it.body.readAllBytes().decodeToString()) }
                assertEquals(1, response.closes)
            } else {
                val failure = result.exceptionOrNull()
                assertTrue(case.failure.isInstance(failure), "status ${case.status} 抛出了 $failure")
                assertEquals(case.retryable, failure is ImageNodeFailure)
                assertEquals(1, response.closes, "失败的响应要由客户端关闭")
            }
        }
    }

    @Test
    fun `出网失败翻成上游故障，原始异常只挂在 cause 上`() {
        val client = FakeUpstream { throw IOException("Connection reset") }.client()

        val failure = assertFailsWith<AppException.UpstreamFailure> {
            client.fetchGallerySlice(EhAccess.ANONYMOUS, GalleryRef(1, "0123456789"), 0)
        }
        assertEquals("请求 e 站失败，可能是网络不通或超时", failure.message)
        assertIs<IOException>(failure.cause?.cause)
    }

    @Test
    fun `校验凭据：表站认了才算数，里站那一探失败只当没有里站权限`() {
        val credential = EhCredential("1", "hash")
        fun verify(home: () -> FakeResponse, ex: () -> FakeResponse) = FakeUpstream { request ->
            if (request.uri.host == "exhentai.org") ex() else home()
        }.client().verifyCredential(credential)

        assertTrue(verify({ page("home") }, { page("gallery list") }))
        // 里站在账号没权限时回 200 加空 body，不是 403
        assertFalse(verify({ page("home") }, { page("") }))
        assertFalse(verify({ page("home") }, { throw IOException("reset") }))
        // 未登录时 home.php 会 302 到论坛登录页
        assertFailsWith<AppException.InvalidArgument> { verify({ FakeResponse("", 302) }, { page("") }) }
        // 200 也可能是封禁页：那时 Cookie 本身没问题，不能报成「Cookie 用不了」
        assertFailsWith<AppException.ResourceExhausted> { verify({ page("temporarily banned") }, { page("") }) }
        assertFailsWith<AppException.UpstreamFailure> { verify({ throw IOException("reset") }, { page("ok") }) }
    }

    @Test
    fun `表站接口不带用户 Cookie，里站接口带`() {
        val upstream = FakeUpstream { page("""{"i3":"<img id=\"img\" src=\"https://ehgt.org/a.webp\">"}""") }
        val client = upstream.client()
        val credential = EhCredential("1", "hash", "ig")

        client.showImage(EhAccess(credential, Site.E), GalleryRef(1, "0123456789"), 1, "0123456789", "key")
        client.showImage(EhAccess(credential, Site.EX), GalleryRef(1, "0123456789"), 1, "0123456789", "key")

        val (front, ex) = upstream.requests
        assertEquals("nw=1; sl=dm_2", front.headers.getFirst("Cookie"))
        assertEquals("nw=1; sl=dm_2; ipb_member_id=1; ipb_pass_hash=hash; igneous=ig", ex.headers.getFirst("Cookie"))
    }
}
