package com.github.kzw200015.myapi.codex.service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.github.kzw200015.myapi.codex.model.CallLog;
import com.github.kzw200015.myapi.codex.service.CodexProxyExceptions.NoAvailableAccountException;
import com.github.kzw200015.myapi.codex.service.CodexProxyExceptions.UpstreamRequestFailedException;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.model.mapper.CodexAccountMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;

/**
 * /api/responses 反向代理：按粘性会话 + 轮询选择账号，转发到上游 Codex responses。
 */
@Service
public class CodexProxyService {
    private static final String CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
    private static final String CODEX_HEADER_INSTRUCTIONS_TEXT_URL =
        "https://raw.githubusercontent.com/anomalyco/opencode/refs/heads/dev/packages/opencode/src/session/prompt/codex_header.txt";

    private static final Duration DEFAULT_STICKY_TTL = Duration.ofHours(1);

    private static final String HEADER_X_CODEX_BETA_FEATURES = "x-codex-beta-features";
    private static final String HEADER_X_OAI_WEB_SEARCH_ELIGIBLE = "x-oai-web-search-eligible";
    private static final String HEADER_SESSION_ID = "session_id";
    private static final String HEADER_CONVERSATION_ID = "conversation_id";
    private static final String HEADER_ORIGINATOR = "originator";
    private static final String HEADER_CHATGPT_ACCOUNT_ID = "ChatGPT-Account-Id";
    private static final String HEADER_USER_AGENT = "User-Agent";
    private static final String HEADER_AUTHORIZATION = "Authorization";

    private static final List<String> UPSTREAM_HEADER_WHITELIST = List.of(
        HEADER_X_CODEX_BETA_FEATURES,
        HEADER_X_OAI_WEB_SEARCH_ELIGIBLE,
        HEADER_SESSION_ID,
        HEADER_CONVERSATION_ID,
        HEADER_USER_AGENT,
        HEADER_ORIGINATOR
    );

    private final CodexAccountMapper codexAccountMapper;
    private final StickySessionService stickySessionService;
    private final AtomicLong rrCounter;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String defaultInstructions;

    public CodexProxyService(CodexAccountMapper codexAccountMapper, ObjectMapper objectMapper) {
        this.codexAccountMapper = codexAccountMapper;
        this.stickySessionService = new StickySessionService(DEFAULT_STICKY_TTL);
        this.rrCounter = new AtomicLong(0);
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        this.objectMapper = objectMapper;
        this.defaultInstructions = fetchText(CODEX_HEADER_INSTRUCTIONS_TEXT_URL);
    }

    public CallLog proxyResponses(HttpServletRequest request, HttpServletResponse response, byte[] rawBody) throws Exception {
        long startAt = System.currentTimeMillis();

        String clientIp = request.getRemoteAddr() == null ? "" : request.getRemoteAddr();
        String userAgent = trim(request.getHeader(HEADER_USER_AGENT));

        JsonNode bodyJson;
        try {
            bodyJson = objectMapper.readTree(rawBody);
        } catch (Exception ex) {
            throw new IllegalArgumentException("invalid JSON body");
        }

        boolean stream = bodyJson.path("stream").asBoolean(false);
        String promptCacheKey = bodyJson.path("prompt_cache_key").asText("");
        ObjectNode updated = bodyJson.deepCopy();
        String instructions = updated.path("instructions").asText("");
        if (instructions.isBlank()) {
            updated.put("instructions", defaultInstructions);
        }
        updated.remove("max_output_tokens");
        byte[] bodyBytes = objectMapper.writeValueAsBytes(updated);

        String stickyKey = stickySessionService.extractKey(request, promptCacheKey);
        CodexAccountEntity account = selectAccount(stickyKey);

        TokenUsage usage;
        HttpHeaders upstreamHeaders = buildUpstreamHeaders(request, account);
        if (stream) {
            usage = forwardSse(response, bodyBytes, upstreamHeaders);
        } else {
            usage = forwardHttp(response, bodyBytes, upstreamHeaders);
        }

        double cacheRate = 0.0;
        if (usage.inputTokens() > 0) {
            cacheRate = (double) usage.cachedInputTokens() / (double) usage.inputTokens();
        }

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
            stream
        );
    }

    private String fetchText(String url) {
        try {
            RestClient restClient = RestClient.create();
            return restClient.get().uri(url).retrieve().body(String.class);
        } catch (RestClientResponseException ex) {
            throw new IllegalStateException("initialize proxy service failed", ex);
        } catch (Exception ex) {
            throw new IllegalStateException("initialize proxy service failed", ex);
        }
    }

    private HttpHeaders buildUpstreamHeaders(HttpServletRequest request, CodexAccountEntity account) {
        HttpHeaders headers = new HttpHeaders();
        for (String key : UPSTREAM_HEADER_WHITELIST) {
            Enumeration<String> values = request.getHeaders(key);
            if (values == null) {
                continue;
            }
            while (values.hasMoreElements()) {
                headers.add(key, values.nextElement());
            }
        }
        headers.set(HEADER_AUTHORIZATION, "Bearer " + account.getToken());
        headers.set(HEADER_CHATGPT_ACCOUNT_ID, account.getAccountId());
        return headers;
    }

    private CodexAccountEntity selectAccount(String stickyKey) {
        List<CodexAccountEntity> accounts = codexAccountMapper.selectList(
            new QueryWrapper<CodexAccountEntity>()
                .gt("expires_at", OffsetDateTime.now())
                .orderByAsc("created_at")
        );
        if (accounts.isEmpty()) {
            throw new NoAvailableAccountException();
        }

        if (stickyKey != null && !stickyKey.isBlank()) {
            StickySessionService.BindingResult binding = stickySessionService.getBindingAccountId(stickyKey);
            if (binding.found()) {
                for (CodexAccountEntity account : accounts) {
                    if (account.getAccountId().equals(binding.accountId())) {
                        return account;
                    }
                }
                stickySessionService.deleteBinding(stickyKey);
            }
        }

        int index = (int) (rrCounter.getAndIncrement() % accounts.size());
        CodexAccountEntity selected = accounts.get(index);
        if (stickyKey != null && !stickyKey.isBlank()) {
            stickySessionService.setBinding(stickyKey, selected.getAccountId());
        }
        return selected;
    }

    private TokenUsage forwardHttp(HttpServletResponse response, byte[] body, HttpHeaders headers) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(CODEX_RESPONSES_URL))
            .timeout(Duration.ZERO)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body));
        headers.forEach((k, v) -> v.forEach(val -> builder.header(k, val)));

        HttpResponse<byte[]> upstream;
        try {
            upstream = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
        } catch (Exception ex) {
            throw new UpstreamRequestFailedException(ex);
        }

        byte[] responseBody = upstream.body();
        TokenUsage usage = parseUsageFromResponseBody(responseBody);

        response.setStatus(upstream.statusCode());
        response.getOutputStream().write(responseBody);
        return usage;
    }

    private TokenUsage forwardSse(HttpServletResponse response, byte[] body, HttpHeaders headers) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(CODEX_RESPONSES_URL))
            .timeout(Duration.ZERO)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body))
            .header(HttpHeaders.ACCEPT, MediaType.TEXT_EVENT_STREAM_VALUE);
        headers.forEach((k, v) -> v.forEach(val -> builder.header(k, val)));

        HttpResponse<InputStream> upstream;
        try {
            upstream = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (Exception ex) {
            throw new UpstreamRequestFailedException(ex);
        }

        if (upstream.statusCode() != 200) {
            throw new UpstreamRequestFailedException("upstream request failed: status=" + upstream.statusCode(), null);
        }

        response.setStatus(200);
        response.setContentType(MediaType.TEXT_EVENT_STREAM_VALUE);

        TokenUsage usage = new TokenUsage(0, 0, 0);
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

    private TokenUsage parseUsageFromResponseBody(byte[] bodyBytes) {
        try {
            JsonNode node = objectMapper.readTree(bodyBytes);
            return new TokenUsage(
                node.path("usage").path("input_tokens").asInt(0),
                node.path("usage").path("input_tokens_details").path("cached_tokens").asInt(0),
                node.path("usage").path("output_tokens").asInt(0)
            );
        } catch (Exception ex) {
            return new TokenUsage(0, 0, 0);
        }
    }

    private void updateUsageFromSseEventData(String rawJson, TokenUsageHolder holder) {
        if (rawJson == null || rawJson.isBlank()) {
            return;
        }
        try {
            JsonNode node = objectMapper.readTree(rawJson);
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
        } catch (Exception ignored) {
        }
    }

    private static String trim(String raw) {
        return raw == null ? "" : raw.trim();
    }

    private record TokenUsage(int inputTokens, int cachedInputTokens, int outputTokens) {}

    private static class TokenUsageHolder {
        private int inputTokens;
        private int cachedInputTokens;
        private int outputTokens;

        void set(int inputTokens, int cachedInputTokens, int outputTokens) {
            this.inputTokens = inputTokens;
            this.cachedInputTokens = cachedInputTokens;
            this.outputTokens = outputTokens;
        }

        TokenUsage toUsage() {
            return new TokenUsage(inputTokens, cachedInputTokens, outputTokens);
        }
    }
}
