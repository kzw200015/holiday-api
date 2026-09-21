package io.github.kzw200015.myapi.eh.upstream

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.fixture
import kotlin.test.*

/** 解析器是最脆的一层，样本全是从真实页面裁下来的（src/test/resources/eh/，2026-08-30 采样）。 */
class ParserTest {
    @Test
    fun `搜索结果按页面顺序去重，并解出下一页游标`() {
        val list = parseGalleryList(fixture("gallery-list.html"))

        // 同一个图集在一行里会出现在封面和标题两个链接上，去重后每个只剩一条
        assertEquals(
            listOf(
                GalleryRef(4156906, "f15507afa0"),
                GalleryRef(4156904, "7acd0468d3"),
                GalleryRef(4156901, "3d43767d8e")
            ),
            list.refs,
        )
        // href 里的 & 是 &amp; 实体形式，不解码就取不到 next
        assertEquals("4156820", list.nextCursor)
    }

    @Test
    fun `没命中是空列表，最后一页没有游标，令牌长度不对的链接不算图集`() {
        val empty = parseGalleryList(fixture("empty-gallery-list.html"))
        assertEquals(emptyList(), empty.refs)
        assertNull(empty.nextCursor)

        // 翻到最后一页时 unext 从 <a> 变成 <span>，没有 href
        assertNull(parseNextCursor("""<div class="searchnav"><span id="unext">Next ></span></div>"""))

        // token 固定 10 位十六进制，短的长的都不能收；什么都没认出来又不是「没命中」，就是版面改了
        assertFailsWith<AppException.UpstreamFailure> {
            parseGalleryList("""<a href="/g/123/abc/">x</a><a href="/g/456/0123456789abcdef/">y</a>""")
        }
    }

    @Test
    fun `详情分片解出每页令牌与分片大小`() {
        val slice = parseGallerySlice(fixture("gallery-page.html"))

        assertEquals(mapOf(1 to "1ff5e361bb", 2 to "fa27f217a6", 3 to "60f2a8c343"), slice.pageTokens)
        // 样本只裁了 3 个令牌，分片大小照样按 Showing 那行算
        assertEquals(20, slice.sliceSize)
    }

    @Test
    fun `Showing 那行带千分位逗号，最后一片或没有那行时推不出分片大小`() {
        assertEquals(21, parseGallerySlice("<p>Showing 1,000 - 1,020 of 12,345 images</p>").sliceSize)
        // 最后一片可能不满，不能拿它当账号的分片大小
        assertNull(parseGallerySlice("<p>Showing 321 - 329 of 329 images</p>").sliceSize)
        assertNull(parseGallerySlice("<html></html>").sliceSize)
    }

    @Test
    fun `评论区分上传者留言与普通评论，正文拆成片段`() {
        val comments = parseGalleryComments(fixture("gallery-page.html"))
        assertEquals(3, comments.size)

        // 上传者留言那格写的是 Uploader Comment，没有分数
        val uploader = comments[0]
        assertEquals(0, uploader.id)
        assertTrue(uploader.isUploader)
        assertEquals("Pokom", uploader.author)
        assertEquals("", uploader.score)

        // 页面上写的 31 October 2021, 04:19 是 UTC
        val normal = comments[1]
        assertEquals(4567998, normal.id)
        assertEquals(false, normal.isUploader)
        assertEquals("+7", normal.score)
        assertEquals("2021-10-31T04:19:00Z", normal.postedAt)

        // 换行和链接都要保住
        assertEquals(CommentSegment.Text("Support:"), uploader.segments[0])
        assertEquals(CommentSegment.Break, uploader.segments[1])
        val link = "https://e-hentai.org/g/2231377/5366ade18e/"
        assertContains(uploader.segments, CommentSegment.Link(link, link))
    }

    @Test
    fun `javascript 伪协议的链接降级成纯文本`() {
        val comments = parseGalleryComments(
            """<div id="cdiv"><div class="c1"><div class="c6" id="comment_1"><a href="javascript:alert(1)">点我</a></div></div></div>""",
        )

        // 不放行就意味着前端拿不到可点的 href，XSS 从源头断掉
        assertEquals(listOf(CommentSegment.Text("点我")), comments[0].segments)
    }

    @Test
    fun `图片页解出 showkey、换源令牌与图片地址`() {
        val image = parseImagePage(fixture("image-page.html"))!!

        // 图床节点挂掉时靠 reloadToken 换一台机器重取
        assertEquals("fqoint3an90", image.showKey)
        assertEquals("50398-496692", image.reloadToken)
        assertTrue(image.imageUrl.startsWith("https://bvxhifw.isvxwqkwpklu.hath.network:62121/h/"))

        assertNull(parseImagePage("<html><body>Content Warning</body></html>"))
    }

    @Test
    fun `showpage 的 i3 片段顺带给出下一页的令牌与换源令牌`() {
        val i3 =
            """<a onclick="return load_image(4, 'cb8cbc96af')" href="https://e-hentai.org/s/cb8cbc96af/2231376-4">""" +
                """<img id="img" src="https://x.hath.network/h/abc/keystamp=1-2/3834916_3.webp" style="..." /></a>"""

        // 下一页的令牌白送，顺序阅读就不用再回头请求详情页了
        assertEquals(
            ImagePage(
                "https://x.hath.network/h/abc/keystamp=1-2/3834916_3.webp",
                nextPage = 4,
                nextToken = "cb8cbc96af"
            ),
            parseShowPageFragment(i3),
        )
        // 最后一页没有下一页链接
        assertNull(parseShowPageFragment("""<img id="img" src="https://x.hath.network/a.jpg" />""")!!.nextPage)
        // 片段里带着换源令牌就一并取走，换源时不必回头抓图片页
        val withReload =
            """<img id="img" src="https://x.hath.network/a.jpg" onerror="this.onerror=null; nl('50398-496692')" />"""
        assertEquals("50398-496692", parseShowPageFragment(withReload)!!.reloadToken)
    }

    @Test
    fun `HTML 实体只认带分号且真实存在的写法`() {
        // gdata 返回的标题就是转义过的
        assertEquals("Arcueid & Ciel x Goblin", decodeEntities("Arcueid &amp; Ciel x Goblin"))
        assertEquals("""<tag> "q" 'a'""", decodeEntities("&lt;tag&gt; &quot;q&quot; &#039;a&#039;"))
        assertEquals("AB", decodeEntities("&#65;&#x42;"))
        // 不认识的实体原样保留。用宽松的解码规则会把 &not 解掉，标题里的字面量就被改写了
        assertEquals("&notreal; &", decodeEntities("&notreal; &amp;"))
    }
}
