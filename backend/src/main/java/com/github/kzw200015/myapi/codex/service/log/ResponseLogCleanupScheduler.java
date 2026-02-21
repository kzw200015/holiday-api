package com.github.kzw200015.myapi.codex.service.log;

import java.time.OffsetDateTime;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class ResponseLogCleanupScheduler {
    private static final int RETENTION_DAYS = 7;

    private final ResponseLogService responseLogService;

    @Scheduled(cron = "0 0 3 * * *")
    public void cleanupExpiredLogs() {
        OffsetDateTime cutoffTime = OffsetDateTime.now().minusDays(RETENTION_DAYS);
        responseLogService.deleteLogsBefore(cutoffTime);
    }
}
