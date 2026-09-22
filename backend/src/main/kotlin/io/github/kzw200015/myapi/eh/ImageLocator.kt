package io.github.kzw200015.myapi.eh

import com.github.benmanes.caffeine.cache.Cache
import com.github.benmanes.caffeine.cache.Caffeine
import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.eh.upstream.*
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.concurrent.Executors

/**
 * 取图链路：从图集定位到某一页真正的图片地址。
 *
 * 一页图要先从详情页分片里拿到这页的令牌，再抓图片页（或走 showpage 接口）拿到图床地址。
 * 途中拿到的东西都缓存住，并且一律按上游身份、站点与完整的图集定位信息隔离：换绑凭据就进入新的作用域，
 * 不同身份之间不共享页面。图片地址与换源令牌来自同一页，作为一个结果一起缓存、一起作废。
 */
@Component
class ImageLocator(private val client: EhClient) {
    internal val pageTokens: Cache<PageKey, String> = cache(20_000, Duration.ofMinutes(30))

    /** 分片大小是账号设置，按身份记：换一本图集照样猜得对。键是 [EhAccess.scope]。 */
    private val sliceSizes: Cache<String, Int> = cache(200, Duration.ofMinutes(30))
    internal val showKeys: Cache<GalleryKey, String> = cache(200, Duration.ofMinutes(30))
    internal val images: Cache<PageKey, ImagePage> = cache(5_000, Duration.ofMinutes(20))

    /**
     * 详情页分片。评论与取图常常同时要同一片（进详情页时评论和第一页图一起请求），同一个分片同一时刻只发一次请求；
     * 取到后短暂留一会儿给紧跟着的请求用。加载跑在它自己的虚拟线程上，不占着同一个 key 的锁等网络——
     * 同步缓存在加载期间会挡住落在同一个桶里的其他 key，所以用异步缓存的同步视图。失败的加载不会留在缓存里。
     */
    private val slices: Cache<SliceKey, GallerySlice> = Caffeine.newBuilder()
        .maximumSize(50)
        .expireAfterWrite(Duration.ofMinutes(1))
        .executor(Executors.newVirtualThreadPerTaskExecutor())
        .buildAsync<SliceKey, GallerySlice>()
        .synchronous()

    fun resolve(access: EhAccess, ref: GalleryRef, page: Int): String {
        val gallery = GalleryKey(access.scope, ref)
        val key = PageKey(gallery, page)
        images.getIfPresent(key)?.let { return it.imageUrl }
        val pageToken = pageToken(access, gallery, page)

        showKeys.getIfPresent(gallery)?.let { showKey ->
            // 只有明确的 showkey 失效才回退到抓图片页，其余协议错误直接报告
            val image = client.showImage(access, ref, page, pageToken, showKey)
            if (image != null) {
                return remember(key, image)
            }
            showKeys.invalidate(gallery)
        }
        return remember(key, client.fetchImagePage(access, ref, page, pageToken))
    }

    /** 图床节点失效时，淘汰已失败的地址，从这一页的图片页重新定位；有这一页的 nl 令牌就请求换源。 */
    fun refresh(access: EhAccess, ref: GalleryRef, page: Int): String {
        val gallery = GalleryKey(access.scope, ref)
        val key = PageKey(gallery, page)
        val previous = images.getIfPresent(key)
        images.invalidate(key)
        val pageToken = pageToken(access, gallery, page)
        var image = client.fetchImagePage(access, ref, page, pageToken, previous?.reloadToken)
        // showpage 可能只给了图片地址：先从当前页补齐 nl 再换源，不能借用其他页的令牌
        if (previous?.reloadToken == null && image.reloadToken != null) {
            image = client.fetchImagePage(access, ref, page, pageToken, image.reloadToken)
        }
        return remember(key, image)
    }

    fun gallerySlice(access: EhAccess, ref: GalleryRef, slice: Int) =
        sliceOf(access, GalleryKey(access.scope, ref), slice)

    private fun sliceOf(access: EhAccess, gallery: GalleryKey, index: Int): GallerySlice =
        slices.get(SliceKey(gallery, index)) {
            client.fetchGallerySlice(access, gallery.ref, index).also { page ->
                page.pageTokens.forEach { (number, token) -> pageTokens.put(PageKey(gallery, number), token) }
                page.sliceSize?.let { sliceSizes.put(gallery.scope, it) }
            }
        }

    /**
     * 这一页的图片页令牌。分片大小受账号设置影响（20/40/50），没记过就按 20 猜，猜错了按实际分片大小再取一次。
     *
     * 猜的那片若是满的，它自己就给出了分片大小；若是最后一片（不满，或者猜的序号超出范围、e 站退回了最后一片），
     * 就从第一片推：第一片要么是满的，要么整本只有这一片、这一页也就在里面。
     */
    private fun pageToken(access: EhAccess, gallery: GalleryKey, page: Int): String {
        pageTokens.getIfPresent(PageKey(gallery, page))?.let { return it }
        val guessed = sliceSizes.getIfPresent(gallery.scope) ?: DEFAULT_SLICE_SIZE
        val slice = sliceOf(access, gallery, (page - 1) / guessed)
        // 直接用本次结果：缓存淘汰不影响已经取到的令牌
        slice.pageTokens[page]?.let { return it }
        slice.pageCount?.let { if (page > it) throw AppException.NotFound("第 $page 页超出了图集的页数（共 $it 页）") }
        val size = slice.sliceSize ?: sliceOf(access, gallery, 0).let { first ->
            first.pageTokens[page]?.let { return it }
            first.sliceSize
        }
        if (size != null && size != guessed) {
            sliceOf(access, gallery, (page - 1) / size).pageTokens[page]?.let { return it }
        }
        throw unavailable("没能取到第 $page 页的图片令牌")
    }

    private fun remember(key: PageKey, image: ImagePage): String {
        images.put(key, image)
        image.showKey?.let { showKeys.put(key.gallery, it) }
        // 下一页的令牌白送，顺序阅读就不用再回头请求详情页了
        if (image.nextPage != null && image.nextToken != null) {
            pageTokens.put(PageKey(key.gallery, image.nextPage), image.nextToken)
        }
        return image.imageUrl
    }

    internal data class GalleryKey(val scope: String, val ref: GalleryRef)

    internal data class PageKey(val gallery: GalleryKey, val page: Int)

    private data class SliceKey(val gallery: GalleryKey, val slice: Int)

    private companion object {
        const val DEFAULT_SLICE_SIZE = 20

        fun <K : Any, V : Any> cache(size: Long, ttl: Duration): Cache<K, V> =
            Caffeine.newBuilder().maximumSize(size).expireAfterWrite(ttl).build()
    }
}
