package com.github.kzw200015.myapi.codex.model;

public record CodexQuotaAdditionalLimit(
    String limitName,
    String meteredFeature,
    CodexQuotaRateLimit rateLimit
) {}
