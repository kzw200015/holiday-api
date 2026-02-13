package com.github.kzw200015.myapi.codex.service;

import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import tools.jackson.databind.json.JsonMapper;

/**
 * 处理普通 HTTP（非 SSE）转发。
 */
@Service
public class CodexHttpProxyForwardService extends AbstractCodexProxyForwardService {
    public CodexHttpProxyForwardService(JsonMapper jsonMapper) {
        super(jsonMapper);
    }

    public HttpForwardResult forward(byte[] body, HttpHeaders headers) throws Exception {
        HttpRequest request = buildUpstreamRequest(body, headers).build();
        HttpResponse<byte[]> upstream = sendUpstream(request, HttpResponse.BodyHandlers.ofByteArray());

        byte[] responseBody = upstream.body();
        TokenUsage usage = parseUsageFromResponseBody(responseBody);
        return new HttpForwardResult(upstream.statusCode(), responseBody, usage);
    }
}
