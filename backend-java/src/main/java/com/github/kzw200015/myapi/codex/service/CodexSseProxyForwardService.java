package com.github.kzw200015.myapi.codex.service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.github.kzw200015.myapi.codex.exception.UpstreamRequestFailedException;
import tools.jackson.databind.json.JsonMapper;

/**
 * 处理 SSE 转发，并从事件流中提取 token usage。
 */
@Service
public class CodexSseProxyForwardService extends AbstractCodexProxyForwardService {
    public CodexSseProxyForwardService(JsonMapper jsonMapper) {
        super(jsonMapper);
    }

    public SseForwardResult forward(byte[] body, HttpHeaders headers) throws Exception {
        HttpRequest request = buildUpstreamRequest(body, headers)
            .header(HttpHeaders.ACCEPT, MediaType.TEXT_EVENT_STREAM_VALUE)
            .build();
        HttpResponse<InputStream> upstream = sendUpstream(request, HttpResponse.BodyHandlers.ofInputStream());

        if (upstream.statusCode() != 200) {
            throw new UpstreamRequestFailedException("upstream request failed: status=" + upstream.statusCode(), null);
        }

        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture<TokenUsage> usageFuture = CompletableFuture.supplyAsync(() -> streamToEmitter(upstream.body(), emitter));
        return new SseForwardResult(emitter, usageFuture);
    }

    private TokenUsage streamToEmitter(InputStream upstreamBody, SseEmitter emitter) {
        TokenUsageHolder usageHolder = new TokenUsageHolder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(upstreamBody, StandardCharsets.UTF_8))) {
            List<String> dataLines = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("data:")) {
                    dataLines.add(line.substring("data:".length()).trim());
                }
                if (!line.isBlank()) {
                    continue;
                }

                if (dataLines.isEmpty()) {
                    continue;
                }

                String data = String.join("\n", dataLines);
                updateUsageFromSseEventData(data, usageHolder);
                emitter.send(SseEmitter.event().data(data));
                dataLines.clear();
            }

            if (!dataLines.isEmpty()) {
                String data = String.join("\n", dataLines);
                updateUsageFromSseEventData(data, usageHolder);
                emitter.send(SseEmitter.event().data(data));
            }

            emitter.complete();
            return usageHolder.toUsage();
        } catch (Exception ex) {
            emitter.completeWithError(ex);
            throw new CompletionException(new UpstreamRequestFailedException(ex));
        }
    }
}
