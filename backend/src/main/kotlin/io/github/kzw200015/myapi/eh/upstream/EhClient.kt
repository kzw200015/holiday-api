package io.github.kzw200015.myapi.eh.upstream

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.concurrently
import kotlinx.coroutines.async
import org.slf4j.LoggerFactory
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.http.client.ClientHttpResponse
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.io.Closeable
import java.io.InputStream
import java.net.URI
import java.net.URLEncoder
import java.time.Instant

/**
 * e 站的只读客户端：上游协议、「200 但不是内容」的识别与失败翻译，以及已校验过的图片流。
 *
 * 出网只有这一个出口，要加限速也就只有一处可加。由 eh.EhConfiguration 按配置组装。
 */
class EhClient(
    private val http: RestClient,
    /** 取图专用：图片是边读边转发的，超时的算法与页面请求不同，见 eh.EhConfiguration。 */
    private val images: RestClient,
    private val json: JsonMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun search(access: EhAccess, keyword: String, categories: List<String>, cursor: String): GalleryList {
        val query = buildList {
            if (keyword.isNotEmpty()) add("f_search" to keyword)
            categoryFilter(categories)?.let { add("f_cats" to it.toString()) }
            if (cursor.isNotEmpty()) add("next" to cursor)
        }.joinToString("&") { (name, value) -> "$name=${URLEncoder.encode(value, Charsets.UTF_8)}" }
        return parseGalleryList(fetchPage(access, "/?$query"))
    }

    /** 元数据一律匿名请求表站，按上游的批量上限自己切片；整批失败报错，单条不可访问的不出现在结果里。 */
    fun fetchMetadata(refs: Collection<GalleryRef>): Map<GalleryRef, GalleryMetadata> =
        refs.chunked(METADATA_BATCH_SIZE).flatMap { chunk ->
            val payload = mapOf(
                "method" to "gdata",
                "gidlist" to chunk.map { listOf(it.gid, it.token) },
                "namespace" to 1,
            )
            val response = callApi(EhAccess.ANONYMOUS, payload)
            // 整个请求被拒时（gidlist 格式不对、条数超限）没有 gmetadata，只有一个顶层的 error
            response.path("error").asString("").takeIf { it.isNotEmpty() }?.let {
                throw unavailable("e 站元数据接口拒绝了请求：$it")
            }
            val entries = response.path("gmetadata").takeIf { it.isArray }
                ?: throw unavailable("e 站元数据接口没有返回图集数据")
            // 单个图集被删或转私有时，那一条会变成 { gid, error }，跳过它，别让整批作废
            entries.values().filter { it.path("error").asString("").isEmpty() }.map { entry ->
                toMetadata(entry).also {
                    if (it.ref !in chunk) {
                        throw unavailable("e 站返回的图集定位信息与请求不一致")
                    }
                }
            }
        }.associateBy { it.ref }

    fun fetchGallerySlice(access: EhAccess, ref: GalleryRef, slice: Int): GallerySlice {
        val parsed = parseGallerySlice(fetchPage(access, "/g/${ref.gid}/${ref.token}/?p=$slice"))
        if (parsed.pageTokens.isEmpty()) {
            throw unavailable("图集页面没有可识别的图片令牌")
        }
        return parsed
    }

    fun fetchImagePage(
        access: EhAccess,
        ref: GalleryRef,
        page: Int,
        pageToken: String,
        reloadToken: String? = null
    ): ImagePage {
        val reload = reloadToken?.let { "?nl=${URLEncoder.encode(it, Charsets.UTF_8)}" }.orEmpty()
        return parseImagePage(fetchPage(access, "/s/$pageToken/${ref.gid}-$page$reload"))
            ?: throw unavailable("第 $page 页没解析出图片地址，e 站版面可能改了")
    }

    /** 经 showpage 接口取图片地址；showkey 过期时返回 null，调用方回退到抓图片页。其余协议错误照常抛出。 */
    fun showImage(access: EhAccess, ref: GalleryRef, page: Int, pageToken: String, showKey: String): ImagePage? {
        val payload =
            mapOf("method" to "showpage", "gid" to ref.gid, "page" to page, "imgkey" to pageToken, "showkey" to showKey)
        val response = callApi(access, payload)
        when (val error = response.path("error").asString("")) {
            "" -> Unit
            "Key mismatch" -> return null
            else -> throw unavailable("e 站图片接口拒绝了请求：$error")
        }
        return parseShowPageFragment(response.path("i3").asString(""))
            ?: throw unavailable("第 $page 页的图片接口没有返回图片地址")
    }

    /**
     * 验证一组 Cookie 能不能用，能用就顺便回答有没有里站权限。
     *
     * 「Cookie 不对」和「e 站没连上」是两种错：前者回 400 让用户重新复制，后者是 502 或 429，
     * 混成一句「这组 Cookie 用不了」会让人对着一组好好的 Cookie 反复重贴。
     */
    fun verifyCredential(credential: EhCredential): Boolean {
        val cookie = cookieHeader(credential)
        // 两个请求互不依赖，串起来只是白等一个跨境往返
        val (home, ex) = concurrently {
            // 未登录时 home.php 会 302 到论坛登录页，登录成功才是 200
            val home = async { runCatching { read(HttpMethod.GET, HOME_URL, cookie) } }
            val ex = async { runCatching { read(HttpMethod.GET, "${Site.EX.pageHost}/", cookie) } }
            home.await() to ex.await()
        }
        val response = home.getOrThrow()
        if (response.status != 200) {
            throw credentialRejected()
        }
        // 200 也可能是封禁页：那时 Cookie 本身没问题，报成「Cookie 用不了」会误导
        assertUsable(response)
        // 里站在账号没权限时回 200 加空 body（俗称 sad panda）；那一探连不上就当没有权限，表站已经证明凭据是好的
        return ex.getOrNull()?.let { it.status == 200 && it.body.isNotBlank() } ?: false
    }

    /**
     * 取一张图片，成功时交出已校验的图片流，由调用方关闭；失败时这里负责关掉响应。
     *
     * 地址必须在图片主机白名单里：这是唯一接受任意上游地址的入口。
     */
    fun openImage(url: String): Attachment {
        if (!isAllowedImageUrl(url)) {
            log.warn("图片地址不在白名单内，已拒绝 url={}", url)
            throw unavailable("图片地址不在允许的范围内")
        }
        log.debug("请求 e 站 GET {}", url)
        // 一个 Cookie 都不带：图床不认 e 站的身份，发过去只是白白泄露给第三方主机
        val response = try {
            images.get().uri(URI.create(url)).exchange({ _, response -> response }, false)
        } catch (e: ResourceAccessException) {
            throw ImageNodeFailure("连不上图床节点", e)
        }
        try {
            when (val status = response.statusCode.value()) {
                200 -> Unit
                509 -> throw quotaExceeded()
                else -> throw ImageNodeFailure("图床返回了 HTTP $status")
            }
            // 上游出错时回的是 HTML 错误页，原样转发会让浏览器显示一张裂图，日志里也查不出原因。
            // SVG 也不放行：它能带脚本，图片地址在本站源下被直接打开时就能读到登录令牌，而图床节点是第三方志愿者运营的
            val contentType = response.headers.getFirst(HttpHeaders.CONTENT_TYPE).orEmpty()
            val type = contentType.lowercase()
            if (!type.startsWith("image/") || type.startsWith("image/svg")) {
                throw unavailable("图床返回的不是图片（${contentType.ifEmpty { "无类型" }}）")
            }
            return Attachment(contentType, response.headers.contentLength.takeIf { it >= 0 }, url, response)
        } catch (e: Throwable) {
            response.close()
            throw e
        }
    }

    private fun fetchPage(access: EhAccess, pathAndQuery: String): String {
        val url = access.site.pageHost + pathAndQuery
        return read(HttpMethod.GET, url, cookieHeader(access.credential)).also(::assertUsable).body
    }

    /**
     * 调 JSON 接口（gdata / showpage），带着调用方给的身份：gdata 由调用方以匿名身份调，showpage 要和抓图片页时是同一份身份，
     * 否则 showkey 是登录的会话拿到的，兑换却按匿名算。
     */
    private fun callApi(access: EhAccess, payload: Map<String, Any>): JsonNode {
        val response =
            read(HttpMethod.POST, access.site.apiHost, cookieHeader(access.credential), json.writeValueAsBytes(payload))
        assertUsable(response)
        return try {
            json.readTree(response.body)
        } catch (e: Exception) {
            throw AppException.UpstreamFailure("e 站接口返回的不是预期的 JSON", e)
        }
    }

    /** 页面、JSON 与凭据探测共用：整个响应读进内存。图片流不走这里。 */
    private fun read(method: HttpMethod, url: String, cookie: String, body: ByteArray? = null): Buffered {
        // 排查「一次操作到底打了几个上游请求」时全靠这条；所有页面与接口请求都经过这里，日志也就只记这一处
        log.debug("请求 e 站 {} {}", method, url)
        var request = http.method(method).uri(URI.create(url)).header(HttpHeaders.COOKIE, cookie)
        if (body != null) {
            request = request.contentType(MediaType.APPLICATION_JSON).body(body)
        }
        return try {
            request.exchange { _, response ->
                Buffered(url, response.statusCode.value(), response.body.readAllBytes().decodeToString())
            }
        } catch (e: ResourceAccessException) {
            throw unreachable(e)
        }
    }

    private class Buffered(val url: String, val status: Int, val body: String)

    /**
     * 把上游那些「200 但不是内容」的响应翻译成明确的失败。
     *
     * 这几种情况 e 站都回 HTTP 200：只看状态码的话，IP 被封时会被当成正常 HTML 解析出空列表，
     * 然后继续按原节奏请求，把临时封禁续成长期封禁。
     */
    private fun assertUsable(response: Buffered) = assertUsable(response.status, response.body, response.url)

    internal fun assertUsable(status: Int, body: String, url: String) {
        // 509 是 e 站专门表示图片配额耗尽的状态码，先判它——509 的响应体也可能是空的
        if (status == 509) {
            throw quotaExceeded()
        }
        // 里站在 Cookie 无效或账号无权限时回 200 加空 body，不是 403
        if (body.isBlank()) {
            throw sadPanda()
        }
        // 按上游页面的固定文案识别，版面变更时需要更新样本
        if ("temporarily banned" in body || "excessive pageloads" in body) {
            log.warn("出口 IP 被 e 站临时封禁 url={}", url)
            throw banned()
        }
        // 被标记的图集在没有 nw cookie 时回一张插页
        if ("Content Warning" in body) {
            throw contentWarning()
        }
        // 正常的页面请求不会重定向，会重定向说明身份没被认下来
        if (status >= 300) {
            throw unavailable("e 站返回了 HTTP $status")
        }
    }

    private companion object {
        /** gdata 的批量上限属于上游协议，调用方不需要自己切片。 */
        const val METADATA_BATCH_SIZE = 25

        /** 检查账号在表站是否登录成功：未登录时这个页面会 302 走。 */
        val HOME_URL = "${Site.E.pageHost}/home.php"

        /** 上游的数字、HTML 实体与时间在协议边界统一转换。 */
        fun toMetadata(entry: JsonNode) = GalleryMetadata(
            ref = GalleryRef(entry.flexNumber("gid").toLong(), entry.path("token").asString("")),
            title = decodeEntities(entry.path("title").asString("")),
            titleJpn = decodeEntities(entry.path("title_jpn").asString("")),
            category = entry.path("category").asString(""),
            thumbnailUrl = entry.path("thumb").asString(""),
            uploader = entry.path("uploader").asString(""),
            postedAt = Instant.ofEpochSecond(entry.flexNumber("posted").toLong()),
            fileCount = entry.flexNumber("filecount").toInt(),
            rating = entry.flexNumber("rating"),
            tags = entry.path("tags").values().map { decodeEntities(it.asString("")) },
            fileSize = entry.flexNumber("filesize").toLong(),
            torrentCount = entry.flexNumber("torrentcount").toInt(),
            expunged = entry.path("expunged").asBoolean(false),
        )

        /**
         * e 站 JSON 里数字的写法不统一：gid 是数字，filecount、rating 这些是字符串（"329"、"4.68"）。两种都收下；
         * 缺省、null 和空串都算 0，别让一个没填的字段废掉整批元数据。
         */
        fun JsonNode.flexNumber(field: String): Double {
            val node = path(field)
            return when {
                node.isMissingNode || node.isNull -> 0.0
                node.isNumber -> node.doubleValue()
                node.isString && node.stringValue().isEmpty() -> 0.0
                else -> node.asString("").toDoubleOrNull() ?: throw unavailable("e 站元数据里的 $field 不是数字")
            }
        }

        /** 固定要带的 Cookie 加上用户自己的。 */
        fun cookieHeader(credential: EhCredential?): String = buildList {
            // nw=1 跳过被标记图集的内容警告插页；sl=dm_2 把搜索结果锁定成 Compact 模式，免得账号的显示设置把列表结构换掉
            add("nw=1")
            add("sl=dm_2")
            if (credential != null) {
                add("ipb_member_id=${credential.ipbMemberId}")
                add("ipb_pass_hash=${credential.ipbPassHash}")
                if (credential.igneous.isNotEmpty()) add("igneous=${credential.igneous}")
            }
        }.joinToString("; ")
    }
}

/** 已校验的图片流，外加转发时要带的响应头。关闭它就是关闭上游响应。 */
class Attachment(
    val contentType: String,
    /** 上游给的长度；分块传输时没有。 */
    val contentLength: Long?,
    /** 上游地址，只用于转发中断时的日志。 */
    val source: String,
    private val response: ClientHttpResponse,
) : Closeable {
    val body: InputStream get() = response.body

    override fun close() {
        // 先关流再关响应：取图走的 SimpleClientHttpResponse 在 close 时会把剩下的内容读完好复用连接，
        // 浏览器中途放弃一张大图（快速翻页时成批发生）时，那等于在服务端把整张图白下一遍。
        // 流先关掉，它那一步就读不动了，读失败的异常它自己会吞掉
        runCatching { response.body.close() }
        response.close()
    }
}

/** 图片主机白名单。 */
private const val IMAGE_HOST = "ehgt.org"

/** H@H 节点的域名后缀。前面那个点不能省，否则 `evilhath.network` 也会被放行。 */
private const val HATH_SUFFIX = ".hath.network"

/**
 * 图片代理唯一的 SSRF 防线，不要放宽：只认精确的 ehgt.org 与 *.hath.network，别的一律拒绝。
 * 用 contains 或不带点的 endsWith 都会被 `ehgt.org.attacker.com` 之类绕过去；user@host 的形式能让粗心的主机名判断认错域。
 * H@H 节点用的是非标准端口（实测有 62121），所以端口不限制。
 */
fun isAllowedImageUrl(raw: String): Boolean {
    val uri = runCatching { URI(raw) }.getOrNull() ?: return false
    val host = uri.host ?: return false
    return uri.scheme == "https" && uri.rawUserInfo == null && (host == IMAGE_HOST || host.endsWith(HATH_SUFFIX))
}
