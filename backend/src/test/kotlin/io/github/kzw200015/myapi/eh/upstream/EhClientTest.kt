package io.github.kzw200015.myapi.eh.upstream

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.FakeResponse
import io.github.kzw200015.myapi.eh.FakeUpstream
import io.github.kzw200015.myapi.eh.page
import java.io.IOException
import kotlin.reflect.KClass
import kotlin.test.*

class EhClientTest {
    /**
     * 「200 但不是你要的东西」有好几种，全都必须识别出来：只看状态码的话，IP 被封时会被当成正常页面解析出空列表，
     * 然后继续按原节奏请求，把临时封禁续成长期封禁。
     */
    @Test
    fun `识别上游那些看起来正常的失败`() {
        val client = FakeUpstream { page("") }.client()
        data class Case(val url: String, val status: Int, val body: String, val expected: KClass<out AppException>?)

        val front = "https://e-hentai.org/"
        val ex = "https://exhentai.org/"
        val cases = listOf(
            Case(front, 509, "whatever", AppException.ResourceExhausted::class),
            // 509 的响应体也可能是空的，先判状态码才能给出准确的提示
            Case(front, 509, "", AppException.ResourceExhausted::class),
            // 里站 Cookie 无效时回空 body（200，或 302 回表站），不是 403
            Case(ex, 200, "", AppException.InvalidArgument::class),
            Case(ex, 200, "   \n  ", AppException.InvalidArgument::class),
            Case(ex, 302, "", AppException.InvalidArgument::class),
            Case("https://s.exhentai.org/api.php", 200, "", AppException.InvalidArgument::class),
            // 表站回空页面是出口 IP 被封了，跟 Cookie 无关
            Case(front, 200, "", AppException.ResourceExhausted::class),
            // 5xx 是 e 站自己出了状况，不能说成 Cookie 失效
            Case(ex, 503, "", AppException.UpstreamFailure::class),
            Case(front, 502, "<html>Bad Gateway</html>", AppException.UpstreamFailure::class),
            // 封禁页是一句不带标签的纯文本
            Case(
                front,
                200,
                "Your IP address has been temporarily banned for excessive pageloads. The ban expires in 59 minutes",
                AppException.ResourceExhausted::class,
            ),
            Case(front, 200, "detected excessive pageloads", AppException.ResourceExhausted::class),
            // 正常页面里的标题、评论、回显的搜索词出现同样的字眼不算
            Case(front, 200, """<div class="c6">I got temporarily banned lol</div>""", null),
            Case(front, 200, """<input name="f_search" value="Content Warning">""", null),
            // 正常的页面请求不会重定向，会重定向说明身份没被认下来
            Case(front, 302, "<html>go away</html>", AppException.UpstreamFailure::class),
            // 搜索没命中是正常页面，交给解析器返回空列表
            Case(front, 200, "<p>No hits found</p>", null),
            Case(front, 200, """<table class="itg">...</table>""", null),
        )
        for ((url, status, body, expected) in cases) {
            val failure = runCatching { client.assertUsable(status, body, url) }.exceptionOrNull()
            assertEquals(expected, failure?.let { it::class }, "assertUsable($url, $status, \"$body\")")
        }
    }

    /** 这些字眼只在页面没解析出东西之后才认：正常页面里也可能出现它们。 */
    @Test
    fun `页面没解析出来时才认内容警告页与 e 站的说明页`() {
        val ref = GalleryRef(1, "0123456789")
        fun slice(body: String) = FakeUpstream { page(body) }.client().fetchGallerySlice(EhAccess.ANONYMOUS, ref, 0)

        // 评论里写着 Content Warning 的正常页面照常解析
        val normal = slice("""<a href="/s/aaaaaaaaaa/1-1">1</a><div class="c6">Content Warning 是个游戏</div>""")
        assertEquals(mapOf(1 to "aaaaaaaaaa"), normal.pageTokens)

        val warning = assertFailsWith<AppException.UpstreamFailure> {
            slice("""<div class="d"><p>Content Warning</p><p>This gallery has been flagged as Offensive.</p></div>""")
        }
        assertEquals(contentWarning().message, warning.message)

        // 图集被删、转私有时 e 站给的是一段说明：原文照转，回 404
        val removed = assertFailsWith<AppException.NotFound> {
            slice("""<div class="d"><p>This gallery has been removed or is unavailable.</p></div>""")
        }
        assertEquals("e 站提示：This gallery has been removed or is unavailable.", removed.message)
        assertFailsWith<AppException.NotFound> {
            FakeUpstream { page("Key missing, or incorrect key provided.") }.client()
                .fetchImagePage(EhAccess.ANONYMOUS, ref, 1, "0123456789")
        }
        // 认不出来的才是版面改了
        assertFailsWith<AppException.UpstreamFailure> { slice("<html><body>something else</body></html>") }
    }

    /** 配额用尽时 e 站把大图换成一张提示图，而不是报错。 */
    @Test
    fun `大图地址换成了配额提示图时报配额用尽`() {
        val ref = GalleryRef(1, "0123456789")
        for (quota in listOf("https://ehgt.org/g/509.gif", "https://exhentai.org/img/509s.gif")) {
            val html = FakeUpstream { page("""<img id="img" src="$quota">""") }.client()
            assertFailsWith<AppException.ResourceExhausted>(quota) {
                html.fetchImagePage(EhAccess.ANONYMOUS, ref, 1, "0123456789")
            }
            val api = FakeUpstream { page("""{"i3":"<img id=\"img\" src=\"$quota\">"}""") }.client()
            assertFailsWith<AppException.ResourceExhausted>(quota) {
                api.showImage(EhAccess.ANONYMOUS, ref, 1, "0123456789", "key")
            }
        }
    }

    /** 标题是任意文本：JSON 解得开就不按文案判断。解不开的纯文本才可能是封禁页。 */
    @Test
    fun `接口返回的标题里有封禁、内容警告的字眼不算失败`() {
        val title = "Content Warning - I got temporarily banned for excessive pageloads"
        val gdata = """{"gmetadata":[{"gid":1,"token":"0123456789","title":"$title"}]}"""
        val metadata = FakeUpstream { FakeResponse(gdata, contentType = "application/json") }.client()
            .fetchMetadata(listOf(GalleryRef(1, "0123456789")))
        assertEquals(title, metadata.values.single().title)

        val banned = FakeUpstream { page("Your IP address has been temporarily banned for excessive pageloads") }.client()
        assertFailsWith<AppException.ResourceExhausted> { banned.fetchMetadata(listOf(GalleryRef(1, "0123456789"))) }
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
        data class Case(
            val status: Int,
            val contentType: String,
            val failure: KClass<out AppException>?,
            val retryable: Boolean
        )

        val cases = listOf(
            Case(200, "image/webp", null, false),
            // 节点失败允许大图换一台节点重试
            Case(403, "image/webp", AppException.UpstreamFailure::class, true),
            Case(509, "text/html", AppException.ResourceExhausted::class, false),
            // 上游出错时回的是 HTML 错误页，原样转发会让浏览器显示一张裂图
            Case(200, "text/html", AppException.UpstreamFailure::class, false),
            // SVG 能带脚本，不当成图片转发
            Case(200, "image/svg+xml", AppException.UpstreamFailure::class, false),
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

    /** H@H 节点下线多半表现为连不上，而不是回一个错误状态码：这同样要换一台节点重试。 */
    @Test
    fun `连不上图床节点也算节点失败`() {
        val client = FakeUpstream { throw IOException("Connection refused") }.client()
        val failure = assertFailsWith<ImageNodeFailure> { client.openImage("https://x.hath.network/h/abc/1.webp") }
        assertIs<IOException>(failure.cause?.cause)
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
    fun `showpage 带着抓图片页时的同一份身份，元数据一律匿名`() {
        val upstream = FakeUpstream { request ->
            if ("gdata" in request.bodyAsString) {
                FakeResponse("""{"gmetadata":[]}""", contentType = "application/json")
            } else {
                page("""{"i3":"<img id=\"img\" src=\"https://ehgt.org/a.webp\">"}""")
            }
        }
        val client = upstream.client()
        val credential = EhCredential("1", "hash", "ig")

        client.showImage(EhAccess(credential, Site.E), GalleryRef(1, "0123456789"), 1, "0123456789", "key")
        client.showImage(EhAccess(credential, Site.EX), GalleryRef(1, "0123456789"), 1, "0123456789", "key")
        client.fetchMetadata(listOf(GalleryRef(1, "0123456789")))

        val (front, ex, metadata) = upstream.requests
        // showkey 是登录的会话拿到的，兑换也得是同一个身份，否则按匿名算
        assertEquals("nw=1; sl=dm_2; ipb_member_id=1; ipb_pass_hash=hash; igneous=ig", front.headers.getFirst("Cookie"))
        assertEquals("nw=1; sl=dm_2; ipb_member_id=1; ipb_pass_hash=hash; igneous=ig", ex.headers.getFirst("Cookie"))
        assertEquals("nw=1; sl=dm_2", metadata.headers.getFirst("Cookie"))
    }
}
