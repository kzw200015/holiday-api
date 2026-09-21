package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.upstream.GalleryMetadata
import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class GalleryServiceTest {
    private val signer = AttachmentSigner("test".toByteArray(), Duration.ofHours(1))

    private fun service(upstream: FakeUpstream): Pair<GalleryService, GalleryCatalog> {
        val client = upstream.client()
        val urls = ImageUrls(signer)
        val catalog = GalleryCatalog(client, urls)
        val service = GalleryService(
            client = client,
            credentials = CredentialService(InMemoryCredentials(), client, testJson),
            catalog = catalog,
            locator = ImageLocator(client),
            reading = ReadingService(NoProgress(), catalog),
            urls = urls,
        )
        return service to catalog
    }

    @Test
    fun `搜索结果保持页面顺序，缓存里没有的按批补齐，取不到的跳过`() {
        val batches = mutableListOf<Int>()
        val listing = (1..28).joinToString("") { """<a href="/g/$it/0123456789/">图集</a>""" } + """<a id="unext" href="/?next=100">下一页</a>"""
        val (service, catalog) = service(
            FakeUpstream { request ->
                if (request.method.name() == "GET") {
                    return@FakeUpstream page(listing)
                }
                val gids = testJson.readTree(request.bodyAsBytes).path("gidlist").values().map { it[0].asLong() }
                batches += gids.size
                // 上游顺序与请求相反，且一条已被删除；结果仍应保留页面顺序并跳过那条
                val entries = gids.reversed().map { gid ->
                    if (gid == 3L) """{"gid":3,"error":"deleted"}""" else """{"gid":$gid,"token":"0123456789","title":"gallery $gid"}"""
                }
                FakeResponse("""{"gmetadata":[${entries.joinToString(",")}]}""", contentType = "application/json")
            },
        )
        val cachedRef = GalleryRef(1, "0123456789")
        catalog.cache.put(cachedRef, metadata(cachedRef, "cached"))

        val result = service.search(1, SearchQuery())

        // 已命中缓存的那条不再请求；gdata 一批最多 25 条
        assertEquals(listOf(25, 2), batches)
        assertEquals((1L..28L).filter { it != 3L }, result.items.map { it.gid })
        assertEquals("cached", result.items[0].title)
        assertEquals("100", result.nextCursor)
        assertTrue(result.items.all { it.thumbnail.startsWith("/api/eh/thumbnail?u=") })
    }

    @Test
    fun `搜索条件在出网之前校验`() {
        val upstream = FakeUpstream { error("不该出网") }
        val (service, _) = service(upstream)
        val invalid = listOf(
            SearchQuery(keyword = "a".repeat(201)),
            SearchQuery(categories = listOf("unknown")),
            SearchQuery(cursor = "1&x=2"),
        )
        for (query in invalid) {
            assertFailsWith<AppException.InvalidArgument> { service.search(1, query) }
        }
        assertEquals(0, upstream.requests.size)
    }

    @Test
    fun `详情取不到图集时回 404`() {
        val (service, _) = service(FakeUpstream { FakeResponse("""{"gmetadata":[{"gid":1,"error":"private"}]}""") })
        assertFailsWith<AppException.NotFound> { service.detail(1, GalleryRef(1, "0123456789")) }
    }

    private fun metadata(ref: GalleryRef, title: String) = GalleryMetadata(
        ref = ref, title = title, titleJpn = "", category = "Manga", thumbnailUrl = "https://ehgt.org/x.webp", uploader = "",
        postedAt = Instant.EPOCH, fileCount = 1, rating = 0.0, tags = emptyList(), fileSize = 0, torrentCount = 0, expunged = false,
    )
}
