package com.github.kzw200015.javaapi.holiday;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 假期业务服务。
 */
@Service
@Slf4j
public class HolidayService {

    /** 日期格式化器。 */
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final HolidayFetcher holidayFetcher;
    private final HolidayStore holidayStore;

    public HolidayService(HolidayFetcher holidayFetcher, HolidayStore holidayStore) {
        this.holidayFetcher = holidayFetcher;
        this.holidayStore = holidayStore;
    }

    /**
     * 刷新当前年与下一年的假期数据。
     */
    public void refreshHolidayData() {
        try {
            final LocalDate today = LocalDate.now();
            final int currentYear = today.getYear();
            final int nextYear = currentYear + 1;
            final List<Holiday> holidays = new ArrayList<>();
            holidays.addAll(holidayFetcher.fetchYear(currentYear));
            holidays.addAll(holidayFetcher.fetchYear(nextYear));
            if (holidays.isEmpty()) {
                log.warn("假期列表为空，跳过刷新");
                return;
            }
            holidayStore.replaceAll(holidays);
            log.info("假期数据刷新完成，数量：{}", holidayStore.size());
        } catch (Exception ex) {
            log.error("假期数据刷新失败", ex);
            if (holidayStore.isEmpty()) {
                throw new IllegalStateException("假期数据初始化失败", ex);
            }
        }
    }

    /**
     * 判断指定日期是否为休息日。
     */
    public boolean isHoliday(LocalDate date) {
        final String dateText = date.format(DATE_FORMATTER);
        final boolean isWeekend = date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY;
        final Holiday holiday = holidayStore.findByDate(dateText);
        if (holiday == null) {
            return isWeekend;
        }
        return holiday.isOffDay();
    }
}
