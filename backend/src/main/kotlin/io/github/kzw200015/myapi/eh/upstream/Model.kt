package io.github.kzw200015.myapi.eh.upstream

import io.github.kzw200015.myapi.AppException
import java.security.MessageDigest
import java.time.Instant
import java.util.*

/** 表站与里站。里站内容是表站的超集，只有带里站权限的 e 站凭据才进得去。 */
enum class Site(val pageHost: String, val apiHost: String) {
    E("https://e-hentai.org", "https://api.e-hentai.org/api.php"),
    EX("https://exhentai.org", "https://s.exhentai.org/api.php"),
}

/**
 * e 站凭据：用户从浏览器里复制出来的三个 Cookie，也是绑定接口的请求体。
 *
 * 让人手动粘贴而不是代填账号密码：forums.e-hentai.org 的登录接口挂在 Cloudflare 盾后面，
 * 服务端直接 POST 会被 403 challenge 拦掉。
 */
data class EhCredential(
    val ipbMemberId: String = "",
    val ipbPassHash: String = "",
    /** 里站专用，没有它就只能看表站，所以允许空串。 */
    val igneous: String = "",
) {
    /** 三个值会被原样拼进 Cookie 请求头，坏值不该有机会出门。 */
    fun validate() {
        if (ipbMemberId.isEmpty() || ipbPassHash.isEmpty()) {
            throw AppException.InvalidArgument("ipb_member_id 和 ipb_pass_hash 都不能为空")
        }
        // 分号能塞进额外的 cookie，空格和引号会把整个头弄坏；用户从浏览器里复制时最容易带上的正是这些
        if (listOf(ipbMemberId, ipbPassHash, igneous).any { !it.all(::isCookieOctet) }) {
            throw AppException.InvalidArgument("Cookie 值里有不允许的字符，检查是不是多复制了分号、空格或引号")
        }
    }
}

/** RFC 6265 允许的 cookie-octet：可见 ASCII，去掉空格、双引号、逗号、分号和反斜杠。 */
private fun isCookieOctet(c: Char) = c in '!'..'~' && c !in "\",;\\"

/** 一次上游请求的身份与站点。没绑凭据时 credential 为 null，匿名访问表站。 */
data class EhAccess(val credential: EhCredential?, val site: Site) {
    /**
     * 缓存作用域：同一份上游身份可以共享页面，换绑任一 Cookie 后自然进入新的作用域。
     * 只保存摘要，不保存也不输出凭据明文。取图一路要用好几次，构造时算一次。
     */
    val scope: String = site.name + ":" + credential?.let {
        val bytes = "${it.ipbMemberId}\n${it.ipbPassHash}\n${it.igneous}".toByteArray()
        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))
    }.orEmpty()

    companion object {
        val ANONYMOUS = EhAccess(null, Site.E)
    }
}

/** 图集定位信息：gid 加 10 位十六进制的 token，列表页 HTML 里能直接抠出来的就这两样。 */
data class GalleryRef(val gid: Long, val token: String) {
    companion object {
        private val TOKEN = Regex("^[0-9a-f]{10}$")

        /**
         * 凡是从外部来的 gid/token 都得先过这里：它们会被拼进上游地址，不校验就等于把用户输入直接发给 e 站。
         * 之后拿着 ref 的代码不必再各自提防一遍。
         */
        fun of(gid: Long, token: String): GalleryRef {
            checkGid(gid)
            if (!TOKEN.matches(token)) {
                throw AppException.InvalidArgument("图集令牌不合法")
            }
            return GalleryRef(gid, token)
        }
    }
}

/** 图集编号必须是正整数。建 ref 与按 gid 删历史两条入口共用这一份规则和文案。 */
fun checkGid(gid: Long) {
    if (gid <= 0) {
        throw AppException.InvalidArgument("图集编号不合法")
    }
}

/** 页码必须是正整数。上报进度与取图两条入口共用这一份规则和文案。 */
fun checkPage(page: Int) {
    if (page <= 0) {
        throw AppException.InvalidArgument("页码不合法")
    }
}

/** 标准化后的上游元数据，不含本站的签名地址或账号的阅读状态。 */
data class GalleryMetadata(
    val ref: GalleryRef,
    val title: String,
    val titleJpn: String,
    val category: String,
    val thumbnailUrl: String,
    val uploader: String,
    val postedAt: Instant,
    val fileCount: Int,
    val rating: Double,
    /** 形如 `artist:gentsuki` 的带命名空间标签。 */
    val tags: List<String>,
    val fileSize: Long,
    val torrentCount: Int,
    val expunged: Boolean,
)

/** 搜索结果一页的图集顺序；nextCursor 为 null 表示已经是最后一页。 */
data class GalleryList(val refs: List<GalleryRef>, val nextCursor: String?)

/** 详情页的一个分片里跟取图有关的部分，外加整页 HTML（评论要用）。 */
data class GallerySlice(
    val html: String,
    val pageTokens: Map<Int, String>,
    /**
     * 账号的分片大小：一片默认列 20 个令牌，登录用户能调成 40/50，由「Showing 1 - 20 of 329」那行推出。
     * 最后一片可能不满，只有中间的分片能确定；确定不了（或没有那一行）是 null。
     */
    val sliceSize: Int?,
    /** 整本的页数，同样取自那一行；没有那一行是 null。 */
    val pageCount: Int?,
)

/** 图片页（/s/ 页面或 showpage 的 i3 片段）里取图要用的东西。 */
data class ImagePage(
    val imageUrl: String,
    val showKey: String? = null,
    /** 顺带给出的下一页令牌：顺序阅读时就不用再回头请求详情页了。 */
    val nextPage: Int? = null,
    val nextToken: String? = null,
    /** 图床节点失效时靠它换一台机器重取。 */
    val reloadToken: String? = null,
)
