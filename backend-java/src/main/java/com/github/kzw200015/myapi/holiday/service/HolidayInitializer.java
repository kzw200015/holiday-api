package com.github.kzw200015.myapi.holiday.service;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;

/**
 * 启动时初始化节假日数据（当年 + 下一年）。
 */
@Component
@RequiredArgsConstructor
public class HolidayInitializer implements ApplicationRunner {
    private final HolidayService holidayService;

    @Override
    public void run(ApplicationArguments args) {
        holidayService.initCurrentAndNextYear();
    }
}
