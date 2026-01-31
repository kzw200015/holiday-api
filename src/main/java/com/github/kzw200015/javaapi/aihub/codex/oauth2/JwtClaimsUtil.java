package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * JWT claims 解析与 Codex accountId 提取。
 */
public final class JwtClaimsUtil {

    private JwtClaimsUtil() {
    }

    public static String extractAccountId(JsonMapper jsonMapper, String idToken, String accessToken) {
        final String fromIdToken = extractAccountIdFromJwt(jsonMapper, idToken);
        if (fromIdToken != null) {
            return fromIdToken;
        }
        return extractAccountIdFromJwt(jsonMapper, accessToken);
    }

    private static String extractAccountIdFromJwt(JsonMapper jsonMapper, String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        final String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }
        try {
            final byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[1]);
            final Map<String, Object> claims = jsonMapper.readValue(payloadBytes, new TypeReference<>() {
            });
            final Object accountId = claims.get("chatgpt_account_id");
            if (accountId instanceof String s && !s.isBlank()) {
                return s;
            }
            final Object apiAuth = claims.get("https://api.openai.com/auth");
            if (apiAuth instanceof Map<?, ?> m) {
                final Object v = m.get("chatgpt_account_id");
                if (v instanceof String s && !s.isBlank()) {
                    return s;
                }
            }
            final Object orgs = claims.get("organizations");
            if (orgs instanceof List<?> list && !list.isEmpty()) {
                final Object first = list.getFirst();
                if (first instanceof Map<?, ?> m) {
                    final Object id = m.get("id");
                    if (id instanceof String s && !s.isBlank()) {
                        return s;
                    }
                }
            }
            return null;
        } catch (Exception ex) {
            return null;
        }
    }
}
