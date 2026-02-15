package com.github.kzw200015.myapi.codex.dto.quota;

public record CodexQuotaWindow(
    Double usedPercent,
    Long limitWindowSeconds,
    Long resetAfterSeconds,
    Long resetAt
) {}
