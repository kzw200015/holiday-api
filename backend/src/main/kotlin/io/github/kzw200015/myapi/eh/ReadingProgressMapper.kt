package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import org.apache.ibatis.annotations.Mapper
import java.time.Instant

/** eh_reading_progress 里的一行：阅读进度与阅读历史共用这张表，每个图集只留一条。 */
data class ProgressRow(val gid: Long, val token: String, val page: Int, val updatedAt: Instant) {
    val ref: GalleryRef get() = GalleryRef(gid, token)
}

/** 阅读历史的翻页位置：上一页最后一条的阅读时间与 gid。 */
data class HistoryCursor(val readAt: Instant, val gid: Long)

/** SQL 在同包路径下的 ReadingProgressMapper.xml。 */
@Mapper
interface ReadingProgressMapper {
    fun findPage(userId: Long, gid: Long): Int?

    fun upsert(userId: Long, gid: Long, token: String, page: Int)

    /** 按最近阅读排序；before 为 null 表示第一页。 */
    fun list(userId: Long, before: HistoryCursor?, limit: Int): List<ProgressRow>

    fun delete(userId: Long, gid: Long)

    fun clear(userId: Long)
}
