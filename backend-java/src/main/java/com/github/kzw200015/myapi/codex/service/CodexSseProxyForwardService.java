package com.github.kzw200015.myapi.codex.service;

import com.github.kzw200015.myapi.codex.exception.UpstreamRequestFailedException;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 处理 SSE 转发，并从事件流中提取 token usage。
 */
@Slf4j
@Service
public class CodexSseProxyForwardService extends AbstractCodexProxyForwardService {
    private final ExecutorService sseForwardExecutor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("codex-sse-forward-", 0).factory()
    );

    public CodexSseProxyForwardService(JsonMapper jsonMapper) {
        super(jsonMapper);
    }

    @PreDestroy
    private void shutdownExecutor() {
        sseForwardExecutor.shutdown();
    }

    public SseForwardResult forward(JsonNode body, HttpHeaders headers) {
        HttpRequest request = buildUpstreamRequest(body, headers)
                .header(HttpHeaders.ACCEPT, MediaType.TEXT_EVENT_STREAM_VALUE)
                .build();
        HttpResponse<InputStream> upstream = sendUpstream(request, HttpResponse.BodyHandlers.ofInputStream());

        if (upstream.statusCode() != HttpStatus.OK.value()) {
            throw new UpstreamRequestFailedException("upstream request failed: status=" + upstream.statusCode());
        }

        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture<TokenUsage> usageFuture = CompletableFuture.supplyAsync(
                () -> streamToEmitter(upstream.body(), emitter),
                sseForwardExecutor
        );
        return new SseForwardResult(emitter, usageFuture);
    }

    private TokenUsage streamToEmitter(InputStream upstreamBody, SseEmitter emitter) {
        TokenUsageHolder usageHolder = new TokenUsageHolder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(upstreamBody, StandardCharsets.UTF_8))) {
            List<String> dataLines = new ArrayList<>();
            String eventName = "";
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("event:")) {
                    eventName = line.substring("event:".length()).trim();
                    continue;
                }
                if (line.startsWith("data:")) {
                    dataLines.add(line.substring("data:".length()).trim());
                    continue;
                }
                if (!line.isBlank()) {
                    continue;
                }

                flushEvent(dataLines, eventName, usageHolder, emitter);
                dataLines.clear();
                eventName = "";
            }

            flushEvent(dataLines, eventName, usageHolder, emitter);

            emitter.complete();
        } catch (IOException ex) {
            log.warn("SSE 流写入失败: {}", ex.getMessage());
            try {
                emitter.complete();
            } catch (Throwable ignored) {
            }
        } catch (Exception ex) {
            emitter.completeWithError(ex);
        }

        return usageHolder.toUsage();
    }

    private void flushEvent(
            List<String> dataLines,
            String eventName,
            TokenUsageHolder usageHolder,
            SseEmitter emitter
    ) throws IOException {
        if (dataLines.isEmpty()) {
            return;
        }

        String data = String.join("\n", dataLines);
        updateUsageFromSseEventData(data, usageHolder);

        SseEmitter.SseEventBuilder event = SseEmitter.event().data(data);
        if (!eventName.isBlank()) {
            event.name(eventName);
        }
        emitter.send(event);
    }
}
