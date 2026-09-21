package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import java.time.Duration
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** 入参校验都在碰数据库和上游之前完成，这里的假 Mapper 一被调到就说明有规则漏了。 */
class ValidationTest {
    private val untouchedPreferences = object : PreferencesMapper {
        override fun find(userId: Long) = error("不该查库")

        override fun savePreferences(userId: Long, categories: List<String>, readerInterval: Int) = error("不该写库")

        override fun saveSearchHistory(userId: Long, entries: List<String>) = error("不该写库")
    }

    @Test
    fun `偏好与搜索历史的规则`() {
        val service = PreferencesService(untouchedPreferences)
        val invalid = listOf(
            GalleryPreferences(listOf("unknown"), 5),
            GalleryPreferences(emptyList(), 0),
            GalleryPreferences(emptyList(), 21),
        )
        for (preferences in invalid) {
            assertFailsWith<AppException.InvalidArgument>("$preferences") { service.savePreferences(1, preferences) }
        }
        for (entries in listOf(listOf("   "), listOf("a".repeat(201)), (1..11).map(Int::toString))) {
            assertFailsWith<AppException.InvalidArgument>("$entries") { service.saveSearchHistory(1, entries) }
        }
    }

    @Test
    fun `入库前把偏好整理成同一种写法，关键词去掉两端空白`() {
        val saved = mutableListOf<Any>()
        val service = PreferencesService(
            object : PreferencesMapper {
                override fun find(userId: Long) = null

                override fun savePreferences(userId: Long, categories: List<String>, readerInterval: Int) {
                    saved.add(categories to readerInterval)
                }

                override fun saveSearchHistory(userId: Long, entries: List<String>) {
                    saved.add(entries)
                }
            },
        )
        assertEquals(GalleryPreferences(emptyList(), 5), service.preferences(1))
        assertEquals(emptyList(), service.searchHistory(1))

        service.savePreferences(1, GalleryPreferences(listOf("manga", "doujinshi", "manga"), 8))
        service.saveSearchHistory(1, listOf(" 词9 ", "词1"))
        assertEquals(listOf(listOf("doujinshi", "manga") to 8, listOf("词9", "词1")), saved)
    }

    @Test
    fun `阅读历史的游标与 gid`() {
        val untouched = object : ReadingProgressMapper by NoProgress() {
            override fun list(userId: Long, before: HistoryCursor?, limit: Int) = error("不该查库")

            override fun delete(userId: Long, gid: Long) = error("不该写库")
        }
        val client = FakeUpstream { error("不该出网") }.client()
        val service = ReadingService(untouched, GalleryCatalog(client, ImageUrls(AttachmentSigner(ByteArray(1), Duration.ofHours(1)))))
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val withoutGid = encoder.encodeToString("2026-01-01T00:00:00Z".toByteArray())
        val zeroGid = encoder.encodeToString("2026-01-01T00:00:00Z,0".toByteArray())
        for (cursor in listOf("!", "a".repeat(257), withoutGid, zeroGid)) {
            assertFailsWith<AppException.InvalidArgument>(cursor) { service.history(1, cursor) }
        }
        for (gid in listOf(0L, -1L)) {
            assertFailsWith<AppException.InvalidArgument> { service.remove(1, gid) }
        }
    }
}
