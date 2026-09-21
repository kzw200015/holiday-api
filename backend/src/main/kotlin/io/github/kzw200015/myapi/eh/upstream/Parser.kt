package io.github.kzw200015.myapi.eh.upstream

import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import java.net.URLDecoder
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Entities
import org.jsoup.nodes.TextNode

/*
 * 解析只由 HTML 提供的东西：图集列表、取图用的定位信息与评论。不发请求、不碰缓存。
 * 这是整套东西里最脆的一层，e 站随时可能改版面；测试里的样本全是从真实页面裁下来的。
 */

/**
 * 图集链接。不挑 `td.gl3c.glname` 这类选择器，是因为搜索结果有 5 种显示模式、由账号设置决定，
 * Thumbnail 模式下整个 <table> 都不存在；全文正则抓链接对所有模式都成立。
 */
private val galleryLink = Regex("""/g/(\d+)/([0-9a-f]{10})/""")

/** 图片页链接，形如 /s/<页令牌>/<gid>-<页码>。 */
private val imagePageLink = Regex("""/s/([0-9a-f]{10})/\d+-(\d+)""")

/** 详情页上的「Showing 1 - 20 of 329」，数字过千会带千分位逗号。 */
private val showing = Regex("""Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)""")

/** 大图本身。图片页和 showpage 的 i3 片段用的是同一个标签。 */
private val mainImage = Regex("""<img[^>]*\bid="img"[^>]*\bsrc="([^"]+)"""")

/** 分页导航里的下一页链接。翻到最后一页时 unext 变成 <span>，没有 href。 */
private val nextCursorLink = Regex("""<a[^>]*\bid="unext"[^>]*\bhref="([^"]*)"""")
private val showKeyScript = Regex("""var\s+showkey\s*=\s*"([^"]+)"""")
private val reloadCall = Regex("""nl\('([^']+)'\)""")

/** 评论时间，形如 `28 May 2022, 01:53`，页面上写的是 UTC。 */
private val commentPostedAt = Regex("""Posted on (\d{1,2} \w+ \d{4}, \d{2}:\d{2})""")
private val commentTimeFormat = DateTimeFormatter.ofPattern("d MMMM yyyy, HH:mm", Locale.ENGLISH)

/** 严格形式的 HTML 实体：必须带分号。 */
private val entity = Regex("""&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);""")

/**
 * 解码 HTML 实体。gdata 返回的标题和标签也是转义过的（实测有 `Arcueid &amp; Ciel x Goblin`），那边没有 DOM 可用，
 * 所以要能独立处理纯字符串。
 *
 * 只认带分号的严格写法、只认真实存在的实体名：按 HTML5 的宽松规则 `&not` 可以省掉分号，
 * `&notreal;` 就会被解成 `¬real;`，标题里出现这种字面量就被改写了。
 */
fun decodeEntities(text: String): String {
    if ('&' !in text) {
        return text
    }
    return entity.replace(text) { match ->
        val name = match.groupValues[1]
        when {
            name.startsWith("#x") || name.startsWith("#X") -> codePoint(name.substring(2).toIntOrNull(16))
            name.startsWith("#") -> codePoint(name.substring(1).toIntOrNull())
            Entities.isNamedEntity(name) -> Entities.getByName(name)
            else -> match.value
        }
    }
}

private fun codePoint(value: Int?): String =
    if (value != null && value != 0 && Character.isValidCodePoint(value)) Character.toString(value) else "\uFFFD"

/** 搜索结果页，只取图集顺序和下一页游标。 */
fun parseGalleryList(page: String): GalleryList {
    // 同一个图集在一行里会出现在多个链接上（封面、标题），按 gid 去重后顺序即页面顺序
    val refs = galleryLink.findAll(page)
        .map { GalleryRef(it.groupValues[1].toLong(), it.groupValues[2]) }
        .distinctBy { it.gid }
        .toList()
    if (refs.isEmpty() && "No hits found" !in page) {
        throw unavailable("没有识别出图集搜索结果，e 站版面可能改了")
    }
    return GalleryList(refs, parseNextCursor(page))
}

fun parseNextCursor(page: String): String? {
    val href = nextCursorLink.find(page)?.groupValues?.get(1) ?: return null
    // href 里的 & 是 &amp; 实体形式，先解码再拆查询串
    val query = decodeEntities(href).substringAfter('?', "")
    return query.split('&')
        .map { it.substringBefore('=') to it.substringAfter('=', "") }
        .firstOrNull { it.first == "next" }
        ?.let { URLDecoder.decode(it.second, Charsets.UTF_8) }
        ?.takeIf { it.isNotEmpty() }
}

/** 详情页一个分片里的每页令牌与分片大小。取图用不着评论，所以这里不建 DOM。 */
fun parseGallerySlice(page: String): GallerySlice {
    val tokens = linkedMapOf<Int, String>()
    for (match in imagePageLink.findAll(page)) {
        val number = match.groupValues[2].toIntOrNull() ?: continue
        tokens.putIfAbsent(number, match.groupValues[1])
    }
    // 本片之后还有页（to < total），才说明本片是满的；总页数只能从这一行取，不能拿 pageTokens.size 顶
    val sliceSize = showing.find(page)?.groupValues?.drop(1)
        ?.map { it.replace(",", "").toIntOrNull() ?: 0 }
        ?.let { (from, to, total) -> if (from in 1..to && to < total) to - from + 1 else null }
    return GallerySlice(html = page, pageTokens = tokens, sliceSize = sliceSize)
}

/** /s/ 图片页。不是图片页（找不到大图）时返回 null。 */
fun parseImagePage(page: String): ImagePage? =
    parseShowPageFragment(page)?.copy(showKey = showKeyScript.find(page)?.groupValues?.get(1))

/**
 * showpage 的 i3 片段：本页的图，外面套着指向下一页的链接；最后一页没有下一页链接。找不到大图时返回 null。
 * 换源令牌挂在大图的 onerror 上，片段里带着就一并取走，换源时省掉一次回头抓图片页。
 */
fun parseShowPageFragment(i3: String): ImagePage? {
    val imageUrl = mainImage.find(i3)?.groupValues?.get(1) ?: return null
    val next = imagePageLink.find(i3)
    return ImagePage(
        imageUrl = imageUrl,
        nextPage = next?.groupValues?.get(2)?.toIntOrNull(),
        nextToken = next?.groupValues?.get(1),
        reloadToken = reloadCall.find(i3)?.groupValues?.get(1),
    )
}

/**
 * 评论正文的片段：第三方评论拆成文本、换行与安全链接，交给 Vue 模板渲染，前端从不插入 HTML。
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes(
    JsonSubTypes.Type(CommentSegment.Text::class, name = "text"),
    JsonSubTypes.Type(CommentSegment.Break::class, name = "break"),
    JsonSubTypes.Type(CommentSegment.Link::class, name = "link"),
)
sealed interface CommentSegment {
    data class Text(val text: String) : CommentSegment

    data object Break : CommentSegment

    data class Link(val text: String, val href: String) : CommentSegment
}

data class GalleryComment(
    /** e 站的评论 id，上传者留言固定是 0。 */
    val id: Long,
    val author: String,
    /** ISO 8601；页面上的时间解析不出来时是空串，让前端显示占位而不是崩掉。 */
    val postedAt: String,
    val isUploader: Boolean,
    /** 形如 `+7`，未登录时页面上就没有这一项，此时为空串。 */
    val score: String,
    val segments: List<CommentSegment>,
)

/** 详情页里的评论。只有评论接口会调，因为它是这里唯一需要建 DOM 的东西。 */
fun parseGalleryComments(page: String): List<GalleryComment> =
    Jsoup.parse(page).select("#cdiv .c1").map { block ->
        val meta = block.selectFirst(".c3")
        val body = block.selectFirst(".c6")
        GalleryComment(
            id = body?.id()?.removePrefix("comment_")?.toLongOrNull() ?: 0,
            author = meta?.selectFirst("a")?.text()?.trim().orEmpty(),
            postedAt = meta?.let { parsePostedAt(it.text()) }?.toString().orEmpty(),
            // 上传者留言那格用 .c4 写着 Uploader Comment，其余条目那个位置是 .c5 的分数
            isUploader = block.selectFirst(".c4") != null,
            score = block.selectFirst(".c5")?.text()?.trim()?.removePrefix("Score")?.trim().orEmpty(),
            segments = body?.let(::parseSegments).orEmpty(),
        )
    }

private fun parsePostedAt(text: String): Instant? {
    val match = commentPostedAt.find(text) ?: return null
    return try {
        LocalDateTime.parse(match.groupValues[1], commentTimeFormat).toInstant(ZoneOffset.UTC)
    } catch (_: DateTimeParseException) {
        null
    }
}

/** 把评论正文的 DOM 拍平成片段，顺带把 javascript: 这类链接降级成纯文本；相邻的文本合并成一段。 */
private fun parseSegments(body: Element): List<CommentSegment> {
    val segments = mutableListOf<CommentSegment>()
    fun add(segment: CommentSegment) {
        val last = segments.lastOrNull()
        if (segment is CommentSegment.Text && last is CommentSegment.Text) {
            segments[segments.lastIndex] = CommentSegment.Text(last.text + segment.text)
        } else {
            segments += segment
        }
    }

    fun walk(element: Element) {
        for (node in element.childNodes()) {
            when {
                node is TextNode -> node.wholeText.takeIf { it.isNotEmpty() }?.let { add(CommentSegment.Text(it)) }
                node !is Element -> Unit
                node.normalName() == "br" -> add(CommentSegment.Break)
                node.normalName() == "a" -> {
                    // 只放行 http/https，javascript: 和 data: 一律降级成普通文字
                    val href = node.attr("href")
                    val text = node.wholeText()
                    val safe = href.startsWith("http://") || href.startsWith("https://")
                    add(if (safe) CommentSegment.Link(text, href) else CommentSegment.Text(text))
                }
                else -> walk(node)
            }
        }
    }
    walk(body)
    return segments
}
