package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.upstream.*
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.*

class ImageLocatorTest {
    private val ref = GalleryRef(1, "0123456789")

    @Test
    fun `缓存淘汰后每一页仍从本次拿到的分片里找到自己的令牌`() {
        val sliceCalls = AtomicInteger()
        val locator = ImageLocator(
            FakeUpstream { request ->
                if (request.uri.path.startsWith("/g/")) {
                    sliceCalls.incrementAndGet()
                    page("Showing 1 - 20 of 100" + (1..20).joinToString("") { """<a href="/s/0123456789/1-$it">page</a>""" })
                } else {
                    page("""<img id="img" src="https://ehgt.org/image.webp">""")
                }
            }.client(),
        )

        for (number in 1..20) {
            // 模拟别的请求把令牌缓存挤掉
            locator.pageTokens.invalidateAll()
            assertEquals("https://ehgt.org/image.webp", locator.resolve(EhAccess.ANONYMOUS, ref, number))
        }
        // 分片本身短暂留着给紧跟的请求用，同一片只抓一次
        assertEquals(1, sliceCalls.get())
    }

    /**
     * 假的详情页：账号每片 [size] 个缩略图，整本 [total] 页。分片序号超出范围时 e 站退回最后一片。
     * 记下每次请求的是第几片。
     */
    private fun galleryOf(total: Int, size: Int, requested: MutableList<Int>) = FakeUpstream { request ->
        if (request.uri.path.startsWith("/g/")) {
            val index = request.uri.query.substringAfter("p=").toInt()
            requested += index
            val from = minOf(index, (total - 1) / size) * size + 1
            val to = minOf(from + size - 1, total)
            page("Showing $from - $to of $total" + (from..to).joinToString("") { """<a href="/s/${"%010x".format(it)}/1-$it">""" })
        } else {
            page("""<img id="img" src="https://ehgt.org/${request.uri.path.substringAfterLast('-')}.webp">""")
        }
    }.client()

    @Test
    fun `分片大小猜错、又落在最后一片时，从第一片推出真实的分片大小`() {
        // 账号设的是每片 40 个：按默认的 20 猜，第 30 页在第 1 片，而 e 站的第 1 片是 41–50，不满，推不出分片大小
        val requested = mutableListOf<Int>()
        val small = ImageLocator(galleryOf(total = 50, size = 40, requested))
        assertEquals("https://ehgt.org/30.webp", small.resolve(EhAccess.ANONYMOUS, ref, 30))
        assertEquals(listOf(1, 0), requested)

        // 猜的第 3 片超出了范围，e 站退回最后一片 81–100；第一片给出分片大小 40，第 70 页在第 1 片
        requested.clear()
        val large = ImageLocator(galleryOf(total = 100, size = 40, requested))
        assertEquals("https://ehgt.org/70.webp", large.resolve(EhAccess.ANONYMOUS, ref, 70))
        assertEquals(listOf(3, 0, 1), requested)
    }

    @Test
    fun `页码超出图集页数时回 404`() {
        val locator = ImageLocator(galleryOf(total = 50, size = 40, mutableListOf()))
        val failure = assertFailsWith<AppException.NotFound> { locator.resolve(EhAccess.ANONYMOUS, ref, 60) }
        assertEquals("第 60 页超出了图集的页数（共 50 页）", failure.message)
    }

    @Test
    fun `图片缓存按凭据、站点与完整的图集定位信息隔离`() {
        val imageCalls = AtomicInteger()
        val locator = ImageLocator(
            FakeUpstream { request ->
                if (request.uri.path.startsWith("/g/")) {
                    page("""<a href="/s/0123456789/1-1">page</a>""")
                } else {
                    page("""<img id="img" src="https://ehgt.org/${imageCalls.incrementAndGet()}.webp">""")
                }
            }.client(),
        )
        val identities = listOf(
            EhAccess.ANONYMOUS,
            EhAccess(EhCredential("1", "first"), Site.E),
            EhAccess(EhCredential("1", "changed"), Site.E),
            EhAccess(EhCredential("1", "changed"), Site.EX),
        )
        identities.forEachIndexed { index, access ->
            val url = locator.resolve(access, ref, 1)
            assertEquals("https://ehgt.org/${index + 1}.webp", url, "身份 $index 命中了别的身份的缓存")
            assertEquals(url, locator.resolve(access, ref, 1), "同一身份没有复用缓存")
        }
        locator.resolve(EhAccess.ANONYMOUS, ref.copy(token = "aaaaaaaaaa"), 1)
        assertEquals(5, imageCalls.get(), "换了图集令牌却复用了旧缓存")
    }

    @Test
    fun `不同凭据的分片请求不会被合并`() {
        val started = CountDownLatch(2)
        val release = CountDownLatch(1)
        val locator = ImageLocator(
            FakeUpstream { request ->
                started.countDown()
                release.await(5, TimeUnit.SECONDS)
                page("""<a href="/s/0123456789/1-1">${request.cookie("ipb_member_id")}</a>""")
            }.client(),
        )

        Executors.newVirtualThreadPerTaskExecutor().use { executor ->
            val results = listOf("first", "second").map { member ->
                executor.submit<String> {
                    locator.gallerySlice(
                        EhAccess(EhCredential(member, "hash"), Site.E),
                        ref,
                        0
                    ).html
                }
            }
            assertTrue(started.await(5, TimeUnit.SECONDS), "不同凭据的分片请求被合并成了一个")
            release.countDown()
            val (first, second) = results.map { it.get(5, TimeUnit.SECONDS) }
            assertNotEquals(first, second)
        }
    }

    @Test
    fun `只有 showkey 失效才回退到抓图片页`() {
        for (response in listOf(
            """{"error":"Key mismatch"}""",
            """{"error":"quota denied"}""",
            """{"i3":"unexpected"}"""
        )) {
            val pageCalls = AtomicInteger()
            val locator = ImageLocator(
                FakeUpstream { request ->
                    if (request.method.name() == "POST") {
                        page(response)
                    } else {
                        pageCalls.incrementAndGet()
                        page("""<img id="img" src="https://ehgt.org/new.webp">""")
                    }
                }.client(),
            )
            val gallery = ImageLocator.GalleryKey(EhAccess.ANONYMOUS.scope, ref)
            locator.pageTokens.put(ImageLocator.PageKey(gallery, 1), "0123456789")
            locator.showKeys.put(gallery, "old")

            if ("Key mismatch" in response) {
                assertEquals("https://ehgt.org/new.webp", locator.resolve(EhAccess.ANONYMOUS, ref, 1))
                assertEquals(1, pageCalls.get())
            } else {
                assertFailsWith<AppException.UpstreamFailure>(response) { locator.resolve(EhAccess.ANONYMOUS, ref, 1) }
                assertEquals(0, pageCalls.get(), "普通协议错误被吞掉了")
            }
        }
    }

    @Test
    fun `换源用的是失败那一页自己的 nl 令牌`() {
        val upstream = FakeUpstream { request ->
            if (request.uri.query == "nl=current-page") {
                page("""<img id="img" src="https://ehgt.org/replaced.webp">""")
            } else {
                page("""<img id="img" src="https://ehgt.org/failed.webp" onerror="nl('current-page')">""")
            }
        }
        val locator = ImageLocator(upstream.client())
        val gallery = ImageLocator.GalleryKey(EhAccess.ANONYMOUS.scope, ref)
        locator.pageTokens.put(ImageLocator.PageKey(gallery, 2), "bbbbbbbbbb")
        locator.images.put(
            ImageLocator.PageKey(gallery, 1),
            ImagePage("https://ehgt.org/first.webp", reloadToken = "another-page")
        )
        locator.images.put(ImageLocator.PageKey(gallery, 2), ImagePage("https://ehgt.org/failed.webp"))

        assertEquals("https://ehgt.org/replaced.webp", locator.refresh(EhAccess.ANONYMOUS, ref, 2))
        assertEquals(
            listOf("/s/bbbbbbbbbb/1-2", "/s/bbbbbbbbbb/1-2?nl=current-page"),
            upstream.requests.map { it.uri.rawPath + (it.uri.rawQuery?.let { query -> "?$query" } ?: "") },
        )
    }
}
