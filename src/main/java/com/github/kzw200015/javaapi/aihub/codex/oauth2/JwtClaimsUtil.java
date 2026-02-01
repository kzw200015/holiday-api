package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.Base64;
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

    public static Long extractExpEpochSeconds(JsonMapper jsonMapper, String token) {
        final Map<String, Object> claims = decodeClaims(jsonMapper, token);
        if (claims == null) {
            return null;
        }
        final Object exp = claims.get("exp");
        if (exp instanceof Number n) {
            return n.longValue();
        }
        return null;
    }

    private static String extractAccountIdFromJwt(JsonMapper jsonMapper, String token) {
        final Map<String, Object> claims = decodeClaims(jsonMapper, token);
        if (claims == null) {
            return null;
        }
        final Object apiAuth = claims.get("https://api.openai.com/auth");
        if (!(apiAuth instanceof Map<?, ?> m)) {
            return null;
        }
        final Object accountId = m.get("chatgpt_account_id");
        if (accountId instanceof String s && !s.isBlank()) {
            return s;
        }
        return null;
    }

    private static Map<String, Object> decodeClaims(JsonMapper jsonMapper, String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        final String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }
        try {
            final byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[1]);
            return jsonMapper.readValue(payloadBytes, new TypeReference<>() {
            });
        } catch (Exception ex) {
            return null;
        }
    }
}
