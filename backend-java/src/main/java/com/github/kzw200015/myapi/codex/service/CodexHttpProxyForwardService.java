package com.github.kzw200015.myapi.codex.service;

import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 处理普通 HTTP（非 SSE）转发。
 */
@Service
public class CodexHttpProxyForwardService extends AbstractCodexProxyForwardService {
    public CodexHttpProxyForwardService(ObjectMapper objectMapper) {
        super(objectMapper);
    }

    public TokenUsage forward(HttpServletResponse response, byte[] body, HttpHeaders headers) throws Exception {
        HttpRequest request = buildUpstreamRequest(body, headers).build();
        HttpResponse<byte[]> upstream = sendUpstream(request, HttpResponse.BodyHandlers.ofByteArray());

        byte[] responseBody = upstream.body();
        TokenUsage usage = parseUsageFromResponseBody(responseBody);

        response.setStatus(upstream.statusCode());
        response.getOutputStream().write(responseBody);
        return usage;
    }
}
