package com.github.kzw200015.myapi.codex.service;

import com.github.kzw200015.myapi.codex.exception.UpstreamRequestFailedException;
import com.github.kzw200015.myapi.codex.model.CallLog;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.common.executor.ThreadPoolManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

/**
 * Codex 上游转发的公共父类，封装请求构建与 token usage 解析逻辑。
 */
@Slf4j
public abstract class AbstractCodexProxyForwardService {
    private static final String CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    protected final JsonMapper jsonMapper;
    private final ResponseLogService responseLogService;
    private final ThreadPoolManager threadPoolManager;

    protected AbstractCodexProxyForwardService(JsonMapper jsonMapper, ResponseLogService responseLogService, ThreadPoolManager threadPoolManager) {
        this.jsonMapper = jsonMapper;
        this.responseLogService = responseLogService;
        this.threadPoolManager = threadPoolManager;
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
        return toTokenUsage(extractUsageNodeFromResponseBody(body));
    }

    protected void updateUsageFromSseEventData(String rawJson, TokenUsageHolder holder) {
        if (rawJson == null || rawJson.isBlank()) {
            return;
        }

        JsonNode eventData = jsonMapper.readTree(rawJson);
        String eventType = eventData.path("type").asString();
        if ("response.completed".equals(eventType) || "response.done".equals(eventType)) {
            updateUsageHolder(holder, eventData.path("response").path("usage"));
            return;
        }

        JsonNode usageNode = eventData.path("usage");
        if (usageNode.isObject()) {
            updateUsageHolder(holder, usageNode);
        }
    }

    protected void writeCallLogAfterForward(
            TokenUsage usage,
            boolean stream,
            long startAt,
            String userAgent,
            String clientIp,
            CodexAccountEntity account,
            JsonNode requestBody
    ) {
        CallLog callLog = buildCallLog(usage, stream, startAt, userAgent, clientIp, account, requestBody);
        writeCallLogAsync(callLog);
    }

    private CallLog buildCallLog(
            TokenUsage usage,
            boolean stream,
            long startAt,
            String userAgent,
            String clientIp,
            CodexAccountEntity account,
            JsonNode requestBody
    ) {
        double cacheRate = usage.inputTokens() > 0
                ? (double) usage.cachedInputTokens() / (double) usage.inputTokens()
                : 0.0;

        return new CallLog(
                userAgent,
                clientIp,
                usage.inputTokens(),
                usage.cachedInputTokens(),
                usage.outputTokens(),
                cacheRate,
                (int) (System.currentTimeMillis() - startAt),
                account.getAccountId(),
                account.getName(),
                stream,
                requestBody
        );
    }

    private JsonNode extractUsageNodeFromResponseBody(JsonNode body) {
        JsonNode usageNode = body.path("usage");
        if (!usageNode.isMissingNode()) {
            return usageNode;
        }
        return body.path("response").path("usage");
    }

    private void updateUsageHolder(TokenUsageHolder holder, JsonNode usageNode) {
        TokenUsage usage = toTokenUsage(usageNode);
        holder.set(usage.inputTokens(), usage.cachedInputTokens(), usage.outputTokens());
    }

    private void writeCallLogAsync(CallLog callLog) {
        CompletableFuture.runAsync(() -> {
            try {
                responseLogService.writeCallLog(callLog);
            } catch (Exception ex) {
                log.warn("写入 /api/responses 调用日志失败: {}", ex.getMessage());
            }
        }, threadPoolManager.getCodexLogExecutor());
    }

    private TokenUsage toTokenUsage(JsonNode usageNode) {
        return new TokenUsage(
                usageNode.path("input_tokens").asInt(0),
                usageNode.path("input_tokens_details").path("cached_tokens").asInt(0),
                usageNode.path("output_tokens").asInt(0)
        );
    }
}
