package com.github.kzw200015.myapi.codex.service;

import java.time.Duration;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@RequiredArgsConstructor
public class CodexTokenRefreshScheduler {
    private static final Duration REFRESH_WINDOW = Duration.ofHours(1);

    private final CodexOAuthService codexOAuthService;

    @Scheduled(fixedDelay = 300000, initialDelay = 60000)
    public void refreshExpiringTokens() {
        int refreshedCount = codexOAuthService.refreshExpiringTokens(REFRESH_WINDOW);
        if (refreshedCount > 0) {
            log.info("刷新即将到期 token 完成，刷新数量={}", refreshedCount);
        }
    }
}
