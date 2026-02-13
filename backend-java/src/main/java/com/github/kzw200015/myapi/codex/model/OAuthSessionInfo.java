package com.github.kzw200015.myapi.codex.model;

import java.time.OffsetDateTime;

/**
 * 前端发起 OAuth 所需信息。
 */
public record OAuthSessionInfo(String state, String url, OffsetDateTime expiresAt) {}
