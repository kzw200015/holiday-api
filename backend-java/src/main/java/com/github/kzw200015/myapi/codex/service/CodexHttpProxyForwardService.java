package com.github.kzw200015.myapi.codex.service;

import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.common.executor.ThreadPoolManager;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/**
 * 处理普通 HTTP（非 SSE）转发。
 */
@Service
public class CodexHttpProxyForwardService extends AbstractCodexProxyForwardService {
    public CodexHttpProxyForwardService(JsonMapper jsonMapper, ResponseLogService responseLogService, ThreadPoolManager threadPoolManager) {
        super(jsonMapper, responseLogService, threadPoolManager);
    }

    public ResponseEntity<byte[]> forward(
            JsonNode body,
            HttpHeaders headers,
            String userAgent,
            String clientIp,
            CodexAccountEntity account
    ) {
        long startAt = System.currentTimeMillis();
        HttpRequest request = buildUpstreamRequest(body, headers).build();
        HttpResponse<byte[]> upstream = sendUpstream(request, HttpResponse.BodyHandlers.ofByteArray());

        byte[] responseBody = upstream.body();
        TokenUsage usage = parseUsageFromResponseBody(responseBody);
        writeCallLogAfterForward(usage, false, startAt, userAgent, clientIp, account, body);
        return ResponseEntity.status(upstream.statusCode()).body(responseBody);
    }
}
