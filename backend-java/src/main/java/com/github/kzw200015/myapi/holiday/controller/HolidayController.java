package com.github.kzw200015.myapi.holiday.controller;

import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.github.kzw200015.myapi.common.model.ApiResponse;
import com.github.kzw200015.myapi.holiday.service.HolidayService;
import com.github.kzw200015.myapi.holiday.model.NextOffDayResult;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/holiday")
@RequiredArgsConstructor
public class HolidayController {
    private final HolidayService holidayService;

    @GetMapping("/is-holiday")
    public ResponseEntity<ApiResponse<?>> isHoliday(@RequestParam(required = false) LocalDate date) {
        LocalDate parsed = date == null ? LocalDate.now(ZoneId.systemDefault()) : date;
        boolean isHoliday = holidayService.isHoliday(parsed);
        return ResponseEntity.ok(ApiResponse.ok(isHoliday));
    }

    @GetMapping("/next-off-day")
    public ResponseEntity<ApiResponse<?>> nextOffDay(@RequestParam(required = false) LocalDate date) {
        LocalDate parsed = date == null ? LocalDate.now(ZoneId.systemDefault()) : date;
        NextOffDayResult result = holidayService.queryNextOffDay(parsed);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }
}
