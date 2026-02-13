package com.github.kzw200015.myapi.codex.model;

public record TodayTokenUsage(
    long inputTokens,
    long outputTokens,
    long cachedInputTokens,
    long totalTokens
) {}
