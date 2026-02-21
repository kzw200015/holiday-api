package com.github.kzw200015.myapi.codex.dto.quota;

import java.util.List;

public record CodexAccountQuota(
    String planType,
    CodexQuotaRateLimit rateLimit,
    CodexQuotaRateLimit codeReviewRateLimit,
    List<CodexQuotaAdditionalLimit> additionalRateLimits
) {}
