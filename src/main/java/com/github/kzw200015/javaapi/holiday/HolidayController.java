package com.github.kzw200015.javaapi.holiday;

import com.github.kzw200015.javaapi.common.ApiResponse;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 假期相关接口控制器。
 */
@RestController
@RequestMapping("/api/holiday")
public class HolidayController {

    /** 日期格式化器。 */
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final HolidayService holidayService;

    public HolidayController(HolidayService holidayService) {
        this.holidayService = holidayService;
    }

    /**
     * 判断是否为假期。
     */
    @GetMapping("/is-holiday")
    public ApiResponse<Boolean> isHoliday(@RequestParam(value = "date", required = false) String dateParam) {
        final LocalDate date = dateParam == null || dateParam.isBlank()
            ? LocalDate.now()
            : LocalDate.parse(dateParam, DATE_FORMATTER);
        final boolean isHoliday = holidayService.isHoliday(date);
        return ApiResponse.success(isHoliday);
    }
}
