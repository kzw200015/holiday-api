package com.github.kzw200015.myapi.codexproxy;

import java.time.OffsetDateTime;

import com.github.kzw200015.myapi.persistence.entity.CodexResponseLogEntity;

public record CodexResponseLogItem(
    String userAgent,
    String clientIp,
    int inputTokens,
    int cachedInputTokens,
    int outputTokens,
    double cacheRate,
    int durationMs,
    String accountId,
    String accountName,
    boolean isSse,
    OffsetDateTime createdAt
) {
    static CodexResponseLogItem from(CodexResponseLogEntity entity) {
        return new CodexResponseLogItem(
            entity.getUserAgent(),
            entity.getClientIp(),
            entity.getInputTokens(),
            entity.getCachedInputTokens(),
            entity.getOutputTokens(),
            entity.getCacheRate(),
            entity.getDurationMs(),
            entity.getAccountId(),
            entity.getAccountName(),
            entity.isSse(),
            entity.getCreatedAt()
        );
    }
}
