package com.github.kzw200015.myapi.codex.model;

public record CodexQuotaWindow(
    Double usedPercent,
    Long limitWindowSeconds,
    Long resetAfterSeconds,
    Long resetAt
) {}
