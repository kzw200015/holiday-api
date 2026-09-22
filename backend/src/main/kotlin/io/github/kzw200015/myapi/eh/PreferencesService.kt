package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.upstream.categoryFilter
import org.springframework.stereotype.Service

/** 跨设备共享的图集浏览偏好，不包含页面草稿或自动翻页开关。也是读写两个接口的请求体与响应体。 */
data class GalleryPreferences(val categories: List<String> = emptyList(), val readerInterval: Int = 0)

/** 元素声明成可空：JSON 里混进 null 时 Jackson 不拦集合元素，得由校验回 400，而不是用到时才空指针。 */
data class SearchHistoryBody(val entries: List<String?> = emptyList())

/**
 * 浏览偏好与搜索历史：本站账号的数据，「读一次、之后前端说了算」，所以写入一律是整份替换——
 * 前端推上来的就是它当前的样子，这边只做落不进库才需要拦的校验，然后存住。
 *
 * 写入只回成败，不回存下来的那一份：前端以本地那份为准。整份提交意味着按到达顺序覆盖，
 * 另一台设备刚改的会被盖掉，这是拿本地当真源换来的，见 AGENTS.md 的前端数据层。
 */
@Service
class PreferencesService(private val preferences: PreferencesMapper) {
    fun preferences(userId: Long): GalleryPreferences =
        preferences.find(userId)?.let { GalleryPreferences(it.categories, it.readerInterval) } ?: DEFAULT_PREFERENCES

    fun savePreferences(userId: Long, value: GalleryPreferences) {
        categoryFilter(value.categories)
        if (value.readerInterval !in 1..20) {
            throw AppException.InvalidArgument("自动翻页间隔应为 1–20 秒")
        }
        // 排序去重后入库，存的始终是同一种写法
        preferences.savePreferences(userId, value.categories.distinct().sorted(), value.readerInterval)
    }

    fun searchHistory(userId: Long): List<String> = preferences.find(userId)?.searchHistory.orEmpty()

    /**
     * 哪条在前、要不要去重、留几条都是前端定的。条数超了就整份退回而不是替前端截断——
     * 列上也有同样的 CHECK，两边对不上时报错比静默改数据好排查。
     *
     * 关键词原样存，不在这里去两端空白：前端提交前已经去过，而两边对「空白」的定义不一样（Kotlin 的 trim 会去掉
     * U+001C–U+001F，JS 的不会），这里再去一遍，就会退回前端认为合法的词，之后每次整份提交都跟着失败。
     */
    fun saveSearchHistory(userId: Long, entries: List<String?>) {
        if (entries.size > SEARCH_HISTORY_LIMIT) {
            throw AppException.InvalidArgument("搜索历史最多 $SEARCH_HISTORY_LIMIT 条")
        }
        if (entries.any { it.isNullOrEmpty() || it.toByteArray().size > KEYWORD_MAX_BYTES }) {
            throw AppException.InvalidArgument("搜索历史关键词应为 1–$KEYWORD_MAX_BYTES 字节")
        }
        preferences.saveSearchHistory(userId, entries.filterNotNull())
    }

    private companion object {
        const val SEARCH_HISTORY_LIMIT = 10
        val DEFAULT_PREFERENCES = GalleryPreferences(categories = emptyList(), readerInterval = 5)
    }
}
