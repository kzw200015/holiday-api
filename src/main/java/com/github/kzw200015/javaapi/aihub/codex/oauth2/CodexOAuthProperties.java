package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Codex OAuth2 配置。
 */
@ConfigurationProperties(prefix = "codex.oauth")
public record CodexOAuthProperties(
        String issuer,
        String clientId,
        String redirectUri,
        String scope,
        String originator,
        long pendingTtlSeconds
) {

    public CodexOAuthProperties {
        issuer = hasText(issuer) ? issuer : "https://auth.openai.com";
        clientId = hasText(clientId) ? clientId : "app_EMoamEEZ73f0CkXaXp7hrann";
        redirectUri = hasText(redirectUri) ? redirectUri : "http://localhost:1455/auth/callback";
        scope = hasText(scope) ? scope : "openid profile email offline_access";
        originator = hasText(originator) ? originator : "opencode";
        pendingTtlSeconds = pendingTtlSeconds > 0 ? pendingTtlSeconds : 300;
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
