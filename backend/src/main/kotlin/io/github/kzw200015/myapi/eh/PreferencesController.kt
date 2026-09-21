package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.auth.CurrentUser
import io.github.kzw200015.myapi.web.ApiResponse
import io.github.kzw200015.myapi.web.ok
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** 账号数据：读一次、之后前端说了算，写入一律整份 PUT，只回成败。 */
@RestController
@RequestMapping("/api/eh")
class PreferencesController(private val preferences: PreferencesService) {
    @GetMapping("/preferences")
    fun preferences(@CurrentUser userId: Long) = ok(preferences.preferences(userId))

    @PutMapping("/preferences")
    fun savePreferences(@CurrentUser userId: Long, @RequestBody body: GalleryPreferences): ApiResponse<Nothing?> {
        preferences.savePreferences(userId, body)
        return ok()
    }

    @GetMapping("/search-history")
    fun searchHistory(@CurrentUser userId: Long) = ok(preferences.searchHistory(userId))

    @PutMapping("/search-history")
    fun saveSearchHistory(@CurrentUser userId: Long, @RequestBody body: SearchHistoryBody): ApiResponse<Nothing?> {
        preferences.saveSearchHistory(userId, body.entries)
        return ok()
    }
}
