package com.github.kzw200015.myapi.codex.service;

import com.github.kzw200015.myapi.codex.exception.UpstreamRequestFailedException;
import org.springframework.http.HttpHeaders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Codex 上游转发的公共父类，封装请求构建与 token usage 解析逻辑。
 */
public abstract class AbstractCodexProxyForwardService {
    private static final String CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    protected final JsonMapper jsonMapper;

    protected AbstractCodexProxyForwardService(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    protected HttpRequest.Builder buildUpstreamRequest(JsonNode body, HttpHeaders headers) {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(CODEX_RESPONSES_URL))
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()));
        headers.forEach((key, values) -> values.forEach(value -> builder.header(key, value)));
        return builder;
    }

    protected <T> HttpResponse<T> sendUpstream(HttpRequest request, HttpResponse.BodyHandler<T> handler) {
        try {
            return httpClient.send(request, handler);
        } catch (Exception ex) {
            throw new UpstreamRequestFailedException(ex);
        }
    }

    protected TokenUsage parseUsageFromResponseBody(byte[] bodyBytes) {
        JsonNode body = jsonMapper.readTree(bodyBytes);
        JsonNode usageNode = body.path("usage");
        if (usageNode.isMissingNode()) {
            usageNode = body.path("response").path("usage");
        }
        return toTokenUsage(usageNode);
    }

    protected void updateUsageFromSseEventData(String rawJson, TokenUsageHolder holder) {
        if (rawJson == null || rawJson.isBlank()) {
            return;
        }

        JsonNode eventData = jsonMapper.readTree(rawJson);
        String eventType = eventData.path("type").asString();
        if ("response.completed".equals(eventType) || "response.done".equals(eventType)) {
            TokenUsage usage = toTokenUsage(eventData.path("response").path("usage"));
            holder.set(usage.inputTokens(), usage.cachedInputTokens(), usage.outputTokens());
            return;
        }

        JsonNode usageNode = eventData.path("usage");
        if (usageNode.isObject()) {
            TokenUsage usage = toTokenUsage(usageNode);
            holder.set(usage.inputTokens(), usage.cachedInputTokens(), usage.outputTokens());
        }
    }

    private TokenUsage toTokenUsage(JsonNode usageNode) {
        return new TokenUsage(
                usageNode.path("input_tokens").asInt(0),
                usageNode.path("input_tokens_details").path("cached_tokens").asInt(0),
                usageNode.path("output_tokens").asInt(0)
        );
    }
}
