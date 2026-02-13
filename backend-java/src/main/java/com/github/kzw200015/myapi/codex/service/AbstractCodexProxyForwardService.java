package com.github.kzw200015.myapi.codex.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.springframework.http.HttpHeaders;

import com.github.kzw200015.myapi.codex.exception.UpstreamRequestFailedException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

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

    protected HttpRequest.Builder buildUpstreamRequest(byte[] body, HttpHeaders headers) {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(CODEX_RESPONSES_URL))
            .timeout(Duration.ZERO)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body));
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
        JsonNode node = jsonMapper.readTree(bodyBytes);
        return new TokenUsage(
            node.path("usage").path("input_tokens").asInt(0),
            node.path("usage").path("input_tokens_details").path("cached_tokens").asInt(0),
            node.path("usage").path("output_tokens").asInt(0)
        );
    }

    protected void updateUsageFromSseEventData(String rawJson, TokenUsageHolder holder) {
        if (rawJson == null || rawJson.isBlank()) {
            return;
        }
        JsonNode node = jsonMapper.readTree(rawJson);
        int responseInputTokens = node.path("response").path("usage").path("input_tokens").asInt(0);
        int responseOutputTokens = node.path("response").path("usage").path("output_tokens").asInt(0);
        if (responseInputTokens > 0 || responseOutputTokens > 0) {
            holder.set(
                responseInputTokens,
                node.path("response").path("usage").path("input_tokens_details").path("cached_tokens").asInt(0),
                responseOutputTokens
            );
            return;
        }

        int inputTokens = node.path("usage").path("input_tokens").asInt(0);
        int outputTokens = node.path("usage").path("output_tokens").asInt(0);
        if (inputTokens > 0 || outputTokens > 0) {
            holder.set(
                inputTokens,
                node.path("usage").path("input_tokens_details").path("cached_tokens").asInt(0),
                outputTokens
            );
        }
    }

    public record TokenUsage(int inputTokens, int cachedInputTokens, int outputTokens) {}
}
