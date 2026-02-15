package com.github.kzw200015.myapi.holiday.controller;

import com.github.kzw200015.myapi.common.model.ApiResponse;
import com.github.kzw200015.myapi.holiday.dto.NextOffDayResult;
import com.github.kzw200015.myapi.holiday.service.HolidayService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/holiday")
@RequiredArgsConstructor
public class HolidayController {
    private final HolidayService holidayService;

    @GetMapping("/is-holiday")
    public ApiResponse<Boolean> isHoliday(@RequestParam(required = false) LocalDate date) {
        LocalDate target = date == null ? LocalDate.now() : date;
        return ApiResponse.ok(holidayService.isHoliday(target));
    }

    @GetMapping("/next-off-day")
    public ApiResponse<NextOffDayResult> nextOffDay(@RequestParam(required = false) LocalDate date) {
        LocalDate target = date == null ? LocalDate.now() : date;
        return ApiResponse.ok(holidayService.queryNextOffDay(target));
    }
}
