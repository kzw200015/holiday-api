package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.auth.CurrentUser
import io.github.kzw200015.myapi.eh.upstream.GalleryRef
import io.github.kzw200015.myapi.web.ok
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/eh/galleries")
class GalleryController(private val galleries: GalleryService) {
    /** 游标式分页。这是一次读取，走 POST 只是因为条件里有分类数组。 */
    @PostMapping("/search")
    fun search(@CurrentUser userId: Long, @RequestBody query: SearchQuery) = ok(galleries.search(userId, query))

    @GetMapping("/{gid}/{token}")
    fun detail(@CurrentUser userId: Long, @PathVariable gid: Long, @PathVariable token: String) =
        ok(galleries.detail(userId, GalleryRef.of(gid, token)))

    /** 单独一次请求，不拖慢详情页首屏。 */
    @GetMapping("/{gid}/{token}/comments")
    fun comments(@CurrentUser userId: Long, @PathVariable gid: Long, @PathVariable token: String) =
        ok(galleries.comments(userId, GalleryRef.of(gid, token)))
}
