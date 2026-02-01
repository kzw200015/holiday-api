package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Codex OAuth2 token 响应（用于 jsonb 持久化）。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CodexOAuthToken(
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("expires_in") Long expiresIn,
        @JsonProperty("id_token") String idToken,
        @JsonProperty("refresh_token") String refreshToken,
        String scope,
        @JsonProperty("token_type") String tokenType
) {
}
