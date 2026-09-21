package io.github.kzw200015.myapi.eh

import org.apache.ibatis.annotations.Mapper

/** eh_preferences 里的一行：浏览偏好与搜索历史存在同一行，各自整份替换，互不覆盖。 */
data class PreferencesRow(val categories: List<String>, val readerInterval: Int, val searchHistory: List<String>)

/** SQL 在同包路径下的 PreferencesMapper.xml。 */
@Mapper
interface PreferencesMapper {
    fun find(userId: Long): PreferencesRow?

    fun savePreferences(userId: Long, categories: List<String>, readerInterval: Int)

    fun saveSearchHistory(userId: Long, entries: List<String>)
}
