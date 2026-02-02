package com.github.kzw200015.javaapi.aihub.codex.responses;

import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexAccountCache;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexOAuthProperties;
import okhttp3.HttpUrl;
import okhttp3.Request;
import okhttp3.RequestBody;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.HashMap;
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
    protected final JsonMapper jsonMapper;

    protected AbstractResponsesProxy(CodexOAuthProperties codexOAuthProperties, CodexAccountCache codexAccountCache,
                                     JsonMapper jsonMapper) {
        this.codexOAuthProperties = codexOAuthProperties;
        this.codexAccountCache = codexAccountCache;
        this.jsonMapper = jsonMapper;
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

    protected Map<String, Object> preparePayload(HttpHeaders headers, Map<String, Object> body, OpencodeCodexHeaderProvider provider) {
        final Map<String, Object> payload = body != null ? body : new HashMap<>();
        payload.remove("max_output_tokens");
        applyOpencodeInstructions(headers, payload, provider);
        return payload;
    }

    protected Request buildUpstreamRequest(HttpHeaders headers, Map<String, Object> body,
                                           CodexAccountCache.CachedAccount auth, String accept) {
        final RequestBody requestBody = RequestBody.create(jsonMapper.writeValueAsBytes(body));
        final Request.Builder builder = new Request.Builder().url(UPSTREAM_URL).post(requestBody);
        builder.header(HttpHeaders.ACCEPT, accept);
        builder.header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        copyWhitelistedHeaders(builder, headers);
        applyAuthHeaders(builder, headers, auth);
        return builder.build();
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

    /**
     * 仅对 opencode 请求注入 Codex 指令。
     */
    protected static void applyOpencodeInstructions(HttpHeaders headers, Map<String, Object> body, OpencodeCodexHeaderProvider provider) {
        if (!isOpencodeRequest(headers)) {
            return;
        }
        if (body == null) {
            return;
        }
        final String instructions = provider.getInstructions();
        if (!StringUtils.hasText(instructions)) {
            return;
        }
        final Object existing = body.get("instructions");
        if (existing instanceof String text && StringUtils.hasText(text)) {
            return;
        }
        body.put("instructions", instructions);
    }

    private static boolean isOpencodeRequest(HttpHeaders headers) {
        final String userAgent = headers.getFirst(HttpHeaders.USER_AGENT);
        if (!StringUtils.hasText(userAgent)) {
            return false;
        }
        return userAgent.contains("opencode/");
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
