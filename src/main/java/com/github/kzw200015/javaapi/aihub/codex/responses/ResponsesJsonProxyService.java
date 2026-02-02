package com.github.kzw200015.javaapi.aihub.codex.responses;

import com.github.kzw200015.javaapi.aihub.AccountUsageService;
import com.github.kzw200015.javaapi.aihub.AccountUsageStreamType;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexAccountCache;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexOAuthProperties;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

@Service
public class ResponsesJsonProxyService extends AbstractResponsesProxy {

    private final OkHttpClient httpClient;
    private final AccountUsageService accountUsageService;
    private final OpencodeCodexHeaderProvider opencodeCodexHeaderProvider;

    public ResponsesJsonProxyService(OkHttpClient httpClient, JsonMapper jsonMapper,
                                     CodexOAuthProperties codexOAuthProperties, CodexAccountCache codexAccountCache,
                                     AccountUsageService accountUsageService,
                                     OpencodeCodexHeaderProvider opencodeCodexHeaderProvider) {
        super(codexOAuthProperties, codexAccountCache, jsonMapper);
        this.httpClient = httpClient;
        this.accountUsageService = accountUsageService;
        this.opencodeCodexHeaderProvider = opencodeCodexHeaderProvider;
    }

    public Map<String, Object> proxyJson(HttpHeaders headers, Map<String, Object> body) {
        final long startedNanos = System.nanoTime();
        final Map<String, Object> payload = preparePayload(headers, body, opencodeCodexHeaderProvider);
        final CodexAccountCache.CachedAccount auth = resolveAuth(headers);
        final Request upstreamRequest = buildUpstreamRequest(headers, payload, auth, MediaType.APPLICATION_JSON_VALUE);

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
            accountUsageService.saveUsage(auth.id(), AccountUsageStreamType.NON_STREAM, upstreamStatus, inputTokens, cachedInputTokens, outputTokens, costMs);
        }
    }

}
