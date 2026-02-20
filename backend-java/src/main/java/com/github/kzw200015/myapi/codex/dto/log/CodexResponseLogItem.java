package com.github.kzw200015.myapi.codex.dto.log;

import com.github.kzw200015.myapi.codex.dao.entity.CodexResponseLogEntity;

import java.time.OffsetDateTime;

public record CodexResponseLogItem(
        String userAgent,
        int inputTokens,
        int cachedInputTokens,
        int outputTokens,
        double cacheRate,
        int firstTokenLatencyMs,
        int durationMs,
        String accountName,
        String model,
        boolean isSse,
        OffsetDateTime createdAt
) {
    public static CodexResponseLogItem from(CodexResponseLogEntity entity) {
        return new CodexResponseLogItem(
                entity.getUserAgent(),
                entity.getInputTokens(),
                entity.getCachedInputTokens(),
                entity.getOutputTokens(),
                entity.getCacheRate(),
                entity.getFirstTokenLatencyMs(),
                entity.getDurationMs(),
                entity.getAccountName(),
                entity.getModel(),
                entity.isSse(),
                entity.getCreatedAt()
        );
    }
}
