package com.github.kzw200015.myapi.codex.model;

import java.util.List;

public record CodexAccountQuota(
    String planType,
    CodexQuotaRateLimit rateLimit,
    CodexQuotaRateLimit codeReviewRateLimit,
    List<CodexQuotaAdditionalLimit> additionalRateLimits
) {}
