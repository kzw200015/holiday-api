package com.github.kzw200015.myapi.codex.model;

public record CodexQuotaRateLimit(
    Boolean allowed,
    Boolean limitReached,
    CodexQuotaWindow primaryWindow,
    CodexQuotaWindow secondaryWindow
) {}
