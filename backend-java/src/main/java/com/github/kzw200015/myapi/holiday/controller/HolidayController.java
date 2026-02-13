package com.github.kzw200015.myapi.holiday.controller;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.github.kzw200015.myapi.common.model.ApiResponse;
import com.github.kzw200015.myapi.holiday.service.HolidayService;
import com.github.kzw200015.myapi.holiday.model.NextOffDayResult;

@RestController
@RequestMapping("/api/holiday")
public class HolidayController {
    private final HolidayService holidayService;
    private final DateTimeFormatter dateFormatter;

    public HolidayController(HolidayService holidayService) {
        this.holidayService = holidayService;
        this.dateFormatter = DateTimeFormatter.ofPattern(HolidayService.DATE_LAYOUT);
    }

    @GetMapping("/is-holiday")
    public ResponseEntity<ApiResponse<?>> isHoliday(@RequestParam(name = "date", required = false) String date) {
        LocalDate parsed;
        try {
            parsed = parseHolidayDateOrNow(date);
        } catch (DateTimeParseException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.badRequest(ex.getMessage()));
        }

        boolean isHoliday = holidayService.isHoliday(parsed);
        return ResponseEntity.ok(ApiResponse.ok(isHoliday));
    }

    @GetMapping("/next-off-day")
    public ResponseEntity<ApiResponse<?>> nextOffDay(@RequestParam(name = "date", required = false) String date) {
        LocalDate parsed;
        try {
            parsed = parseHolidayDateOrNow(date);
        } catch (DateTimeParseException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.badRequest(ex.getMessage()));
        }

        NextOffDayResult result = holidayService.queryNextOffDay(parsed);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    private LocalDate parseHolidayDateOrNow(String dateParam) {
        if (dateParam == null || dateParam.isBlank()) {
            return LocalDate.now(ZoneId.systemDefault());
        }
        return LocalDate.parse(dateParam, dateFormatter);
    }
}
