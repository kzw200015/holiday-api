package com.github.kzw200015.myapi.common.executor;

import jakarta.annotation.PreDestroy;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * 线程池管理器，统一管理项目中的各类线程池
 */
@Getter
@Slf4j
@Component
public class ThreadPoolManager {

    /**
     * Codex SSE 转发线程池，用于处理 SSE 流转发任务
     */
    private final ExecutorService codexSseForwardExecutor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("codex-sse-forward-", 0).factory()
    );

    /**
     * Codex 配额查询线程池，用于并行查询多个账号的配额信息
     */
    private final ExecutorService codexQuotaExecutor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("codex-quota-", 0).factory()
    );

    /**
     * Codex 日志写入线程池，用于异步写入调用日志
     */
    private final ExecutorService codexLogExecutor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("codex-log-", 0).factory()
    );

    /**
     * 应用关闭时统一关闭所有线程池
     */
    @PreDestroy
    public void shutdownAll() {
        shutdownExecutor(codexSseForwardExecutor, "codex-sse-forward");
        shutdownExecutor(codexQuotaExecutor, "codex-quota");
        shutdownExecutor(codexLogExecutor, "codex-log");
    }

    /**
     * 关闭单个线程池
     */
    private void shutdownExecutor(ExecutorService executor, String name) {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
                executor.shutdownNow();
                if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
                    log.error("线程池 {} 未能在指定时间内终止", name);
                }
            }
        } catch (InterruptedException ex) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            log.error("关闭线程池 {} 时被中断", name);
        }
    }
}
