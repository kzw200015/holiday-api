package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.auth.CurrentUser
import io.github.kzw200015.myapi.web.ApiResponse
import io.github.kzw200015.myapi.web.ok
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/eh")
class ReadingController(private val reading: ReadingService) {
    /** 记下读到第几页。 */
    @PostMapping("/progress")
    fun saveProgress(@CurrentUser userId: Long, @RequestBody position: ReadingPosition): ApiResponse<Nothing?> {
        reading.save(userId, position)
        return ok()
    }

    @GetMapping("/history")
    fun history(@CurrentUser userId: Long, @RequestParam(defaultValue = "") cursor: String) =
        ok(reading.history(userId, cursor))

    /** 按 gid 认记录，跟表上的唯一约束一致。 */
    @DeleteMapping("/history/{gid}")
    fun remove(@CurrentUser userId: Long, @PathVariable gid: Long): ApiResponse<Nothing?> {
        reading.remove(userId, gid)
        return ok()
    }

    @DeleteMapping("/history")
    fun clear(@CurrentUser userId: Long): ApiResponse<Nothing?> {
        reading.clear(userId)
        return ok()
    }
}
