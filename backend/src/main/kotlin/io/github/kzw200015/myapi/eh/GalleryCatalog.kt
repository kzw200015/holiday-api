package io.github.kzw200015.myapi.eh

import com.fasterxml.jackson.annotation.JsonUnwrapped
import com.github.benmanes.caffeine.cache.Cache
import io.github.kzw200015.myapi.eh.upstream.EhClient
import io.github.kzw200015.myapi.eh.upstream.GalleryMetadata
import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.Instant

/** 列表里一张卡片要展示的内容。 */
data class GalleryCard(
    val gid: Long,
    val token: String,
    val title: String,
    val titleJpn: String,
    val category: String,
    /** 已经换成本站的签名代理地址，不是 ehgt.org 的原始地址。 */
    val thumbnail: String,
    val uploader: String,
    val postedAt: Instant,
    val fileCount: Int,
    val rating: Double,
    val tags: List<String>,
)

/** 详情页在卡片基础上多出三个字段，JSON 里与卡片的字段平铺在一起。 */
data class GalleryDetail(
    @get:JsonUnwrapped val card: GalleryCard,
    val fileSize: Long,
    val torrentCount: Int,
    val expunged: Boolean,
)

/**
 * 图集元数据：统一从表站匿名获取，按图集共享缓存。搜索、详情与阅读历史都经这里补全展示信息。
 *
 * 缓存里存的是上游原始数据，缩略图在组装卡片时才签名，签名的有效期因此不受缓存时长影响。
 */
@Component
class GalleryCatalog(private val client: EhClient, private val urls: ImageUrls) {
    /** 两个请求同时要同一本，只打一次 gdata。 */
    internal val cache: Cache<GalleryRef, GalleryMetadata> = coalescingCache(500, Duration.ofMinutes(10))

    /**
     * 取一批图集的元数据，缓存里没有的一次向上游补齐：翻回上一页、重进详情都会整批命中缓存，一个请求都不用发。
     * 返回的是这一次的结果，不受并发淘汰影响；取不到的图集（被删、转私有）不在结果里。
     */
    fun load(refs: List<GalleryRef>): Map<GalleryRef, GalleryMetadata> = cache.getAll(refs) { client.fetchMetadata(it) }

    fun card(gallery: GalleryMetadata) = GalleryCard(
        gid = gallery.ref.gid,
        token = gallery.ref.token,
        title = gallery.title,
        titleJpn = gallery.titleJpn,
        category = gallery.category,
        thumbnail = urls.thumbnail(gallery.thumbnailUrl),
        uploader = gallery.uploader,
        postedAt = gallery.postedAt,
        fileCount = gallery.fileCount,
        rating = gallery.rating,
        tags = gallery.tags,
    )

    fun detail(gallery: GalleryMetadata) = GalleryDetail(
        card = card(gallery),
        fileSize = gallery.fileSize,
        torrentCount = gallery.torrentCount,
        expunged = gallery.expunged,
    )
}
