package com.github.kzw200015.myapi.codex.model;

import java.time.OffsetDateTime;

import com.github.kzw200015.myapi.codex.model.entity.CodexResponseLogEntity;
import tools.jackson.databind.JsonNode;

public record CodexResponseLogItem(
    String userAgent,
    String clientIp,
    int inputTokens,
    int cachedInputTokens,
    int outputTokens,
    double cacheRate,
    int firstTokenLatencyMs,
    int durationMs,
    String accountName,
    boolean isSse,
    JsonNode requestBody,
    OffsetDateTime createdAt
) {
    public static CodexResponseLogItem from(CodexResponseLogEntity entity) {
        return new CodexResponseLogItem(
            entity.getUserAgent(),
            entity.getClientIp(),
            entity.getInputTokens(),
            entity.getCachedInputTokens(),
            entity.getOutputTokens(),
            entity.getCacheRate(),
            entity.getFirstTokenLatencyMs(),
            entity.getDurationMs(),
            entity.getAccountName(),
            entity.isSse(),
            entity.getRequestBody(),
            entity.getCreatedAt()
        );
    }
}
