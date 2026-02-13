package com.github.kzw200015.myapi.codex.service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

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

    public TokenUsage forward(HttpServletResponse response, byte[] body, HttpHeaders headers) throws Exception {
        HttpRequest request = buildUpstreamRequest(body, headers)
            .header(HttpHeaders.ACCEPT, MediaType.TEXT_EVENT_STREAM_VALUE)
            .build();
        HttpResponse<InputStream> upstream = sendUpstream(request, HttpResponse.BodyHandlers.ofInputStream());

        if (upstream.statusCode() != 200) {
            throw new UpstreamRequestFailedException("upstream request failed: status=" + upstream.statusCode(), null);
        }

        response.setStatus(200);
        response.setContentType(MediaType.TEXT_EVENT_STREAM_VALUE);

        TokenUsageHolder usageHolder = new TokenUsageHolder();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(upstream.body(), StandardCharsets.UTF_8))) {
            ServletOutputStream out = response.getOutputStream();
            List<String> dataLines = new ArrayList<>();

            String line;
            while ((line = reader.readLine()) != null) {
                out.print(line);
                out.print("\n");

                if (line.startsWith("data:")) {
                    dataLines.add(line.substring("data:".length()).trim());
                }
                if (line.isBlank()) {
                    if (!dataLines.isEmpty()) {
                        String data = String.join("\n", dataLines);
                        updateUsageFromSseEventData(data, usageHolder);
                        dataLines.clear();
                    }
                    out.flush();
                }
            }
            out.flush();
        }

        return usageHolder.toUsage();
    }
}
