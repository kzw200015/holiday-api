package com.github.kzw200015.myapi.codex.dto.quota;

public record CodexQuotaRateLimit(
    Boolean allowed,
    Boolean limitReached,
    CodexQuotaWindow primaryWindow,
    CodexQuotaWindow secondaryWindow
) {}
