package com.github.kzw200015.myapi.codex.service.proxy;

import com.github.kzw200015.myapi.codex.dao.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.service.log.ResponseLogService;
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
        int firstTokenLatencyMs = (int) (System.currentTimeMillis() - startAt);

        byte[] responseBody = upstream.body();
        TokenUsage usage = parseUsageFromResponseBody(responseBody);
        writeCallLogAfterForward(usage, false, startAt, firstTokenLatencyMs, userAgent, clientIp, account, body);
        return ResponseEntity.status(upstream.statusCode()).body(responseBody);
    }
}
