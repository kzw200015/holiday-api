package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import io.github.kzw200015.myapi.eh.upstream.checkGid
import io.github.kzw200015.myapi.eh.upstream.checkPage
import java.time.Instant
import java.util.Base64
import org.springframework.stereotype.Service

/** 一次阅读进度上报，也是 POST /api/eh/progress 的请求体。 */
data class ReadingPosition(val gid: Long = 0, val token: String = "", val page: Int = 0)

/** 阅读历史的一条。元数据取不到时 gallery 为 null，但记录照样能删。 */
data class ReadingHistoryItem(val gid: Long, val token: String, val page: Int, val readAt: Instant, val gallery: GalleryCard?)

/** 阅读进度与阅读历史：它们是同一张表，删一条阅读历史，对应的阅读进度也就没了。 */
@Service
class ReadingService(private val progress: ReadingProgressMapper, private val catalog: GalleryCatalog) {
    fun save(userId: Long, position: ReadingPosition) {
        val ref = GalleryRef.of(position.gid, position.token)
        checkPage(position.page)
        progress.upsert(userId, ref.gid, ref.token, position.page)
    }

    /** 这本读到第几页，没读过是 null。 */
    fun progressOf(userId: Long, ref: GalleryRef): Int? = progress.findPage(userId, ref.gid)

    /** 一页阅读历史：记录来自本站的库，每条的展示信息再向上游补齐。 */
    fun history(userId: Long, cursor: String): CursorPage<ReadingHistoryItem> {
        // 多取一条来判断还有没有下一页
        val rows = progress.list(userId, parseCursor(cursor), PAGE_SIZE + 1)
        val page = rows.take(PAGE_SIZE)
        // 整批元数据请求失败照常抛出：那是可以重试的错误，不能把网络故障伪装成所有图集都失效了
        val galleries = catalog.load(page.map { it.ref })
        return CursorPage(
            items = page.map {
                val gallery = galleries[it.ref]?.let(catalog::card)
                ReadingHistoryItem(it.gid, it.token, it.page, it.updatedAt, gallery)
            },
            nextCursor = page.lastOrNull()?.takeIf { rows.size > PAGE_SIZE }?.let(::encodeCursor),
        )
    }

    fun remove(userId: Long, gid: Long) {
        checkGid(gid)
        progress.delete(userId, gid)
    }

    fun clear(userId: Long) = progress.clear(userId)

    private companion object {
        const val PAGE_SIZE = 25
        val encoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
        val decoder: Base64.Decoder = Base64.getUrlDecoder()

        /** 游标是「上一页最后一条的阅读时间 + gid」，编码成一段 base64 交给前端原样带回。 */
        fun encodeCursor(last: ProgressRow): String = encoder.encodeToString("${last.updatedAt},${last.gid}".toByteArray())

        fun parseCursor(value: String): HistoryCursor? {
            if (value.isEmpty()) {
                return null
            }
            return runCatching {
                require(value.length <= 256)
                val (readAt, gid) = decoder.decode(value).decodeToString().split(',', limit = 2)
                HistoryCursor(Instant.parse(readAt), gid.toLong().also { require(it > 0) })
            }.getOrElse { throw AppException.InvalidArgument("阅读历史游标不合法") }
        }
    }
}
