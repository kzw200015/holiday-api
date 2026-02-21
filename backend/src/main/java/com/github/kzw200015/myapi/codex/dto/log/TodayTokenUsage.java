package com.github.kzw200015.myapi.codex.dto.log;

public record TodayTokenUsage(
    long inputTokens,
    long outputTokens,
    long cachedInputTokens,
    long totalTokens
) {}
