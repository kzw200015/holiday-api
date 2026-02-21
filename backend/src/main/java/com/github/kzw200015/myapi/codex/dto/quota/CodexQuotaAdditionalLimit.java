package com.github.kzw200015.myapi.codex.dto.quota;

public record CodexQuotaAdditionalLimit(
    String limitName,
    String meteredFeature,
    CodexQuotaRateLimit rateLimit
) {}
