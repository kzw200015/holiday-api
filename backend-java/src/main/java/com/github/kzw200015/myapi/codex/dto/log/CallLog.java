package com.github.kzw200015.myapi.codex.dto.log;

import tools.jackson.databind.JsonNode;

/**
 * /api/responses 调用日志（写库前的结构）。
 */
public record CallLog(
    String userAgent,
    String clientIp,
    int inputTokens,
    int cachedInputTokens,
    int outputTokens,
    double cacheRate,
    int firstTokenLatencyMs,
    int durationMs,
    String accountId,
    String accountName,
    boolean isSse,
    JsonNode requestBody
) {}
