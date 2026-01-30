package com.github.kzw200015.javaapi.holiday;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 假期数据每天 0 点刷新调度器。
 */
@Component
@Slf4j
public class HolidayScheduler {

    private final HolidayService holidayService;

    public HolidayScheduler(HolidayService holidayService) {
        this.holidayService = holidayService;
    }

    /**
     * 应用启动后先执行一次刷新。
     */
    @PostConstruct
    public void init() {
        safeRefresh();
        log.info("假期刷新任务已启动，每天 00:00 执行");
    }

    /**
     * 每天 00:00 刷新一次假期数据。
     */
    @Scheduled(cron = "0 0 0 * * *")
    public void refresh() {
        safeRefresh();
    }

    /**
     * 带异常保护的刷新执行。
     */
    private void safeRefresh() {
        try {
            holidayService.refreshHolidayData();
        } catch (Exception ex) {
            log.error("定时刷新假期数据失败", ex);
        }
    }
}
