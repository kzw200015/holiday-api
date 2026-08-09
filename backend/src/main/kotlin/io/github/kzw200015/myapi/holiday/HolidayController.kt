package io.github.kzw200015.myapi.holiday

import io.github.kzw200015.myapi.apiresponse.ApiResponse
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/**
 * 节假日相关的 HTTP 接口。
 *
 * date 参数由框架完成转换（ISO 的 YYYY-MM-DD，会拒绝 2024-02-31 等非法日期），
 * 格式错误统一由 GlobalExceptionHandler 转成 400；Kotlin 可空参数即非必填，省略时取当天。
 */
@RestController
@RequestMapping("/api/holiday")
class HolidayController(private val holidayService: HolidayService) {

    /**
     * GET /api/holiday/is-holiday?date=YYYY-MM-DD，仅返回是否休息。
     * 该接口有外部调用方，响应契约固定为 boolean，不要改动。
     */
    @GetMapping("/is-holiday")
    fun isHoliday(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate?,
    ): ApiResponse = ApiResponse.ok(holidayService.query(date ?: LocalDate.now()).isOffDay)

    /** GET /api/holiday/detail?date=YYYY-MM-DD，返回是否休息及对应的节假日名称。 */
    @GetMapping("/detail")
    fun detail(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate?,
    ): ApiResponse = ApiResponse.ok(holidayService.query(date ?: LocalDate.now()))
}
