package com.github.kzw200015.javaapi.aihub.codex.responses;

import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexAccountCache;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexOAuthProperties;
import okhttp3.HttpUrl;
import okhttp3.Request;
import org.springframework.http.HttpHeaders;
import org.springframework.util.StringUtils;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

abstract class AbstractResponsesProxy {

    protected static final HttpUrl UPSTREAM_URL = HttpUrl.get("https://chatgpt.com/backend-api/codex/responses");

    protected static final String HEADER_X_CODEX_BETA_FEATURES = "x-codex-beta-features";
    protected static final String HEADER_X_OAI_WEB_SEARCH_ELIGIBLE = "x-oai-web-search-eligible";
    protected static final String HEADER_SESSION_ID = "session_id";
    protected static final String HEADER_ORIGINATOR = "originator";
    protected static final String HEADER_CHATGPT_ACCOUNT_ID = "ChatGPT-Account-Id";

    protected static final List<String> WHITELIST_HEADERS = List.of(
            HEADER_X_CODEX_BETA_FEATURES,
            HEADER_X_OAI_WEB_SEARCH_ELIGIBLE,
            HEADER_SESSION_ID,
            HttpHeaders.USER_AGENT,
            HEADER_ORIGINATOR
    );

    protected final CodexOAuthProperties codexOAuthProperties;
    protected final CodexAccountCache codexAccountCache;

    protected AbstractResponsesProxy(CodexOAuthProperties codexOAuthProperties, CodexAccountCache codexAccountCache) {
        this.codexOAuthProperties = codexOAuthProperties;
        this.codexAccountCache = codexAccountCache;
    }

    protected void applyAuthHeaders(Request.Builder builder, HttpHeaders headers, CodexAccountCache.CachedAccount auth) {
        builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.accessToken());
        if (StringUtils.hasText(auth.chatgptAccountId())) {
            builder.header(HEADER_CHATGPT_ACCOUNT_ID, auth.chatgptAccountId());
        }
        if (!StringUtils.hasText(headers.getFirst(HEADER_ORIGINATOR)) && StringUtils.hasText(codexOAuthProperties.originator())) {
            builder.header(HEADER_ORIGINATOR, codexOAuthProperties.originator());
        }
    }

    protected CodexAccountCache.CachedAccount resolveAuth(HttpHeaders headers) {
        return codexAccountCache.selectBySessionId(headers.getFirst(HEADER_SESSION_ID));
    }

    protected record TokenUsage(Integer inputTokens, Integer cachedInputTokens, Integer outputTokens) {
    }

    protected static TokenUsage parseSseUsage(JsonMapper jsonMapper, String data) {
        try {
            final Map<String, Object> event = jsonMapper.readValue(data, new TypeReference<>() {
            });
            if (!"response.completed".equals(event.get("type"))) {
                return null;
            }
            final Object response = event.get("response");
            if (!(response instanceof Map<?, ?> responseMap)) {
                return null;
            }
            return extractUsage(responseMap);
        } catch (Exception ignored) {
            return null;
        }
    }

    protected static TokenUsage extractUsage(Map<?, ?> response) {
        final Object usage = response.get("usage");
        if (!(usage instanceof Map<?, ?> usageMap)) {
            return null;
        }
        final Integer inputTokens = usageMap.get("input_tokens") instanceof Number number ? number.intValue() : null;
        final Integer outputTokens = usageMap.get("output_tokens") instanceof Number number ? number.intValue() : null;

        Integer cachedInputTokens = null;
        final Object details = usageMap.get("input_tokens_details");
        if (details instanceof Map<?, ?> detailsMap) {
            cachedInputTokens = detailsMap.get("cached_tokens") instanceof Number number ? number.intValue() : null;
        }

        if (inputTokens == null && cachedInputTokens == null && outputTokens == null) {
            return null;
        }
        return new TokenUsage(inputTokens, cachedInputTokens, outputTokens);
    }

    protected static void copyWhitelistedHeaders(Request.Builder builder, HttpHeaders headers) {
        for (String headerName : WHITELIST_HEADERS) {
            copyHeader(builder, headers, headerName);
        }
    }

    private static void copyHeader(Request.Builder builder, HttpHeaders headers, String headerName) {
        final List<String> values = headers.get(headerName);
        if (values == null || values.isEmpty()) {
            return;
        }

        builder.header(headerName, values.getFirst());
        for (int i = 1; i < values.size(); i++) {
            builder.addHeader(headerName, values.get(i));
        }
    }
}
