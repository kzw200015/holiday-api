package com.github.kzw200015.javaapi.aihub.codex.responses;

import com.github.kzw200015.javaapi.aihub.AccountUsageService;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexAccountCache;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexOAuthProperties;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Service
public class ResponsesJsonProxyService extends AbstractResponsesProxy {

    private final OkHttpClient httpClient;
    private final JsonMapper jsonMapper;
    private final AccountUsageService accountUsageService;

    public ResponsesJsonProxyService(OkHttpClient httpClient, JsonMapper jsonMapper,
                                     CodexOAuthProperties codexOAuthProperties, CodexAccountCache codexAccountCache,
                                     AccountUsageService accountUsageService) {
        super(codexOAuthProperties, codexAccountCache);
        this.httpClient = httpClient;
        this.jsonMapper = jsonMapper;
        this.accountUsageService = accountUsageService;
    }

    public Map<String, Object> proxyJson(HttpHeaders headers, Map<String, Object> body) {
        final long startedNanos = System.nanoTime();
        final Map<String, Object> payload = body != null ? body : new HashMap<>();
        payload.put("stream", false);
        final CodexAccountCache.CachedAccount auth = resolveAuth(headers);
        final Request upstreamRequest = buildUpstreamRequest(headers, payload, auth);

        Integer upstreamStatus = null;
        Integer inputTokens = null;
        Integer cachedInputTokens = null;
        Integer outputTokens = null;
        try (Response upstreamResponse = httpClient.newCall(upstreamRequest).execute()) {
            upstreamStatus = upstreamResponse.code();
            if (!upstreamResponse.isSuccessful()) {
                throw new IllegalStateException("代理请求失败：status=" + upstreamResponse.code());
            }
            final byte[] responseBody = upstreamResponse.body().bytes();
            final Map<String, Object> responseJson = jsonMapper.readValue(responseBody, new TypeReference<>() {
            });

            final TokenUsage usage = extractUsage(responseJson);
            if (usage != null) {
                inputTokens = usage.inputTokens();
                cachedInputTokens = usage.cachedInputTokens();
                outputTokens = usage.outputTokens();
            }
            return responseJson;
        } catch (IOException ex) {
            throw new IllegalStateException("代理请求失败", ex);
        } finally {
            final long costMs = Duration.ofNanos(System.nanoTime() - startedNanos).toMillis();
            accountUsageService.saveUsage(auth.id(), false, upstreamStatus, inputTokens, cachedInputTokens, outputTokens, costMs);
        }
    }

    private Request buildUpstreamRequest(HttpHeaders headers, Map<String, Object> body, CodexAccountCache.CachedAccount auth) {
        final RequestBody requestBody = RequestBody.create(jsonMapper.writeValueAsBytes(body));
        final Request.Builder builder = new Request.Builder().url(UPSTREAM_URL).post(requestBody);
        builder.header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        copyWhitelistedHeaders(builder, headers);
        applyAuthHeaders(builder, headers, auth);
        return builder.build();
    }
}
