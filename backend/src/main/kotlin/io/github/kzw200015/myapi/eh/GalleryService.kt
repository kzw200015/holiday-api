package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.concurrently
import io.github.kzw200015.myapi.eh.upstream.EhClient
import io.github.kzw200015.myapi.eh.upstream.GalleryComment
import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import io.github.kzw200015.myapi.eh.upstream.Site
import io.github.kzw200015.myapi.eh.upstream.categoryFilter
import io.github.kzw200015.myapi.eh.upstream.galleryMissing
import io.github.kzw200015.myapi.eh.upstream.parseGalleryComments
import kotlinx.coroutines.async
import org.springframework.stereotype.Service

/** 搜索词的字节上限。搜索历史存的就是搜过的词，两边共用这一份：各写各的，能搜的词就可能存不进历史。 */
internal const val KEYWORD_MAX_BYTES = 200

/**
 * 一次搜索的全部条件，也是搜索接口的请求体。
 *
 * 带结构的条件（分类是一组名字）编码进查询串就得两头各写一份拼拆规则，所以整条走 JSON，接口也因此是 POST。
 */
data class SearchQuery(
    val keyword: String = "",
    val categories: List<String> = emptyList(),
    /** 空串表示第一页；它是 e 站给的一串数字，会被拼进上游地址。 */
    val cursor: String = "",
    /** 只认显式的 "e"（要表站），别的值一律当成没传，交给账号权限决定。 */
    val site: String? = null,
) {
    fun validate() {
        if (keyword.toByteArray().size > KEYWORD_MAX_BYTES) {
            throw AppException.InvalidArgument("关键词太长了")
        }
        // 认不认得出分类名由 categoryFilter 判断，真正拼 f_cats 也用它，两处不会各判各的
        categoryFilter(categories)
        if (!CURSOR.matches(cursor)) {
            throw AppException.InvalidArgument("分页游标不合法")
        }
    }

    private companion object {
        val CURSOR = Regex("""^\d*$""")
    }
}

/** 触底加载的一页（搜索结果、阅读历史）。nextCursor 为 null 表示已经是最后一页。 */
data class CursorPage<T>(val items: List<T>, val nextCursor: String?)

data class GalleryDetailResult(
    val gallery: GalleryDetail,
    /** 该账号读到第几页，没读过为 null。 */
    val progress: Int?,
    /** 含 {page} 占位符的签名地址，前端只替换页码，不自己拼。 */
    val imageUrlTemplate: String,
)

/** 图集浏览：搜索 → 详情 → 评论。 */
@Service
class GalleryService(
    private val client: EhClient,
    private val credentials: CredentialService,
    private val catalog: GalleryCatalog,
    private val locator: ImageLocator,
    private val reading: ReadingService,
    private val urls: ImageUrls,
) {
    /** 从列表页拿图集顺序和游标，再用 gdata 补全元数据；元数据取不到的图集不出现在结果里。 */
    fun search(userId: Long, query: SearchQuery): CursorPage<GalleryCard> {
        query.validate()
        val access = credentials.access(userId, Site.E.takeIf { query.site == "e" })
        val list = client.search(access, query.keyword, query.categories, query.cursor)
        val galleries = catalog.load(list.refs)
        return CursorPage(list.refs.mapNotNull(galleries::get).map(catalog::card), list.nextCursor)
    }

    /** 详情只打一次 gdata，评论另有接口懒加载；顺带签发这本图集的大图地址模板。 */
    fun detail(userId: Long, ref: GalleryRef): GalleryDetailResult {
        // 阅读进度与元数据互不依赖，并发读取
        val (progress, gallery) = concurrently {
            val progress = async { reading.progressOf(userId, ref) }
            val gallery = async { catalog.load(listOf(ref))[ref] ?: throw galleryMissing() }
            progress.await() to gallery.await()
        }
        return GalleryDetailResult(catalog.detail(gallery), progress, urls.imageTemplate(userId, ref))
    }

    /** 评论是详情页 HTML 里唯一拿不到 JSON 替代的东西，所以单独一次请求；它与取图共用详情首片。 */
    fun comments(userId: Long, ref: GalleryRef): List<GalleryComment> =
        parseGalleryComments(locator.gallerySlice(credentials.access(userId), ref, 0).html)
}
