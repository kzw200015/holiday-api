package com.github.kzw200015.myapi.codex.service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.github.kzw200015.myapi.codex.model.CallLog;
import com.github.kzw200015.myapi.codex.service.CodexProxyExceptions.NoAvailableAccountException;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.model.mapper.CodexAccountMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * /api/responses 反向代理：按粘性会话 + 轮询选择账号，转发到上游 Codex responses。
 */
@Service
@RequiredArgsConstructor
public class CodexProxyService {
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
    private final JsonMapper jsonMapper;
    private final CodexHttpProxyForwardService codexHttpProxyForwardService;
    private final CodexSseProxyForwardService codexSseProxyForwardService;
    private final StickySessionService stickySessionService = new StickySessionService(DEFAULT_STICKY_TTL);
    private final AtomicLong rrCounter = new AtomicLong(0);
    private final String defaultInstructions = fetchText(CODEX_HEADER_INSTRUCTIONS_TEXT_URL);

    public CallLog proxyResponses(HttpServletRequest request, HttpServletResponse response, byte[] rawBody) throws Exception {
        long startAt = System.currentTimeMillis();

        String clientIp = request.getRemoteAddr() == null ? "" : request.getRemoteAddr();
        String userAgent = trim(request.getHeader(HEADER_USER_AGENT));

        JsonNode bodyJson = jsonMapper.readTree(rawBody);

        boolean stream = bodyJson.path("stream").asBoolean(false);
        String promptCacheKey = bodyJson.path("prompt_cache_key").asText("");
        ObjectNode updated = (ObjectNode) bodyJson.deepCopy();
        String instructions = updated.path("instructions").asText("");
        if (instructions.isBlank()) {
            updated.put("instructions", defaultInstructions);
        }
        updated.remove("max_output_tokens");
        byte[] bodyBytes = jsonMapper.writeValueAsBytes(updated);

        String stickyKey = stickySessionService.extractKey(request, promptCacheKey);
        CodexAccountEntity account = selectAccount(stickyKey);

        AbstractCodexProxyForwardService.TokenUsage usage;
        HttpHeaders upstreamHeaders = buildUpstreamHeaders(request, account);
        if (stream) {
            usage = codexSseProxyForwardService.forward(response, bodyBytes, upstreamHeaders);
        } else {
            usage = codexHttpProxyForwardService.forward(response, bodyBytes, upstreamHeaders);
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

    private static String trim(String raw) {
        return raw == null ? "" : raw.trim();
    }
}
