package com.github.kzw200015.myapi.codex.service;

import com.github.kzw200015.myapi.codex.exception.UpstreamRequestFailedException;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.common.executor.ThreadPoolManager;
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

/**
 * 处理 SSE 转发，并从事件流中提取 token usage。
 */
@Slf4j
@Service
public class CodexSseProxyForwardService extends AbstractCodexProxyForwardService {
    private final ThreadPoolManager threadPoolManager;

    public CodexSseProxyForwardService(JsonMapper jsonMapper, ResponseLogService responseLogService, ThreadPoolManager threadPoolManager) {
        super(jsonMapper, responseLogService, threadPoolManager);
        this.threadPoolManager = threadPoolManager;
    }

    public SseEmitter forward(
            JsonNode body,
            HttpHeaders headers,
            String userAgent,
            String clientIp,
            CodexAccountEntity account
    ) {
        long startAt = System.currentTimeMillis();
        HttpRequest request = buildUpstreamRequest(body, headers)
                .header(HttpHeaders.ACCEPT, MediaType.TEXT_EVENT_STREAM_VALUE)
                .build();
        HttpResponse<InputStream> upstream = sendUpstream(request, HttpResponse.BodyHandlers.ofInputStream());

        if (upstream.statusCode() != HttpStatus.OK.value()) {
            throw new UpstreamRequestFailedException("upstream request failed: status=" + upstream.statusCode());
        }

        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture.runAsync(
                () -> streamToEmitter(upstream.body(), emitter, startAt, userAgent, clientIp, account, body),
                threadPoolManager.getCodexSseForwardExecutor()
        );
        return emitter;
    }

    private void streamToEmitter(
            InputStream upstreamBody,
            SseEmitter emitter,
            long startAt,
            String userAgent,
            String clientIp,
            CodexAccountEntity account,
            JsonNode requestBody
    ) {
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
            TokenUsage usage = usageHolder.toUsage();
            writeCallLogAfterForward(usage, true, startAt, userAgent, clientIp, account, requestBody);
        } catch (IOException ex) {
            log.warn("SSE 流写入失败: {}", ex.getMessage());
            emitter.complete();
        } catch (Exception ex) {
            emitter.completeWithError(ex);
            throw new UpstreamRequestFailedException(ex);
        }
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
