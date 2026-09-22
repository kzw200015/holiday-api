package io.github.kzw200015.myapi.holiday

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.auth.Public
import io.github.kzw200015.myapi.web.ok
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.time.format.DateTimeParseException

/** 这两条有外部调用方，不要求登录。 */
@Public
@RestController
@RequestMapping("/api/holiday")
class HolidayController(private val holidays: HolidayService) {
    /** 只回这天是不是休息日。响应契约固定为 boolean，别改。 */
    @GetMapping("/is-holiday")
    fun isHoliday(@RequestParam date: String?) = ok(holidays.query(parseDate(date)).isOffDay)

    /** 是不是休息日，外加对应的节假日名称。 */
    @GetMapping("/detail")
    fun detail(@RequestParam date: String?) = ok(holidays.query(parseDate(date)))

    /** 省略或空串取当天，否则必须是合法的 YYYY-MM-DD。失败文案是接口契约的一部分，前端和外部调用方都按它显示。 */
    private fun parseDate(text: String?): LocalDate {
        if (text.isNullOrEmpty()) {
            return LocalDate.now(CHINA_ZONE)
        }
        return try {
            LocalDate.parse(text)
        } catch (_: DateTimeParseException) {
            throw AppException.InvalidArgument("日期格式错误，应为 YYYY-MM-DD")
        }
    }
}
