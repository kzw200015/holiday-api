package com.github.kzw200015.myapi.codex.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.github.kzw200015.myapi.codex.exception.NoAvailableAccountException;
import com.github.kzw200015.myapi.codex.model.CallLog;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.model.mapper.CodexAccountMapper;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicLong;

/**
 * /api/responses 反向代理：按粘性会话 + 轮询选择账号，转发到上游 Codex responses。
 */
@Service
@Slf4j
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

    private static final List<String> UPSTREAM_HEADER_WHITELIST = List.of(
            HEADER_X_CODEX_BETA_FEATURES,
            HEADER_X_OAI_WEB_SEARCH_ELIGIBLE,
            HEADER_SESSION_ID,
            HEADER_CONVERSATION_ID,
            HttpHeaders.USER_AGENT,
            HEADER_ORIGINATOR
    );

    private final CodexAccountMapper codexAccountMapper;
    private final CodexHttpProxyForwardService codexHttpProxyForwardService;
    private final CodexSseProxyForwardService codexSseProxyForwardService;
    private final ResponseLogService responseLogService;
    private final RestClient restClient;
    private final StickySessionService stickySessionService = new StickySessionService(DEFAULT_STICKY_TTL);
    private final AtomicLong roundRobinCounter = new AtomicLong(0);
    private String defaultInstructions = "";

    @PostConstruct
    private void initializeDefaultInstructions() {
        try {
            defaultInstructions = restClient.get().uri(CODEX_HEADER_INSTRUCTIONS_TEXT_URL).retrieve().body(String.class);
        } catch (Exception ex) {
            log.warn("初始化 instructions 失败: {}", ex.getMessage());
        }
    }

    public Object proxyResponses(HttpServletRequest request, ObjectNode updated) {
        long startAt = System.currentTimeMillis();

        String clientIp = request.getRemoteAddr() == null ? "" : request.getRemoteAddr();
        String userAgent = trim(request.getHeader(HttpHeaders.USER_AGENT));

        boolean stream = updated.path("stream").asBoolean(false);
        String promptCacheKey = updated.path("prompt_cache_key").asString();
        if (promptCacheKey.isBlank()) {
            log.warn("请求缺少 prompt_cache_key");
        }

        if (updated.path("instructions").isMissingNode() || updated.path("instructions").asString().isBlank()) {
            updated.put("instructions", defaultInstructions);
        }
        updated.remove("max_output_tokens");
        JsonNode requestBody = updated.deepCopy();

        String stickyKey = stickySessionService.extractKey(request, promptCacheKey);
        CodexAccountEntity account = selectAccount(stickyKey);

        HttpHeaders upstreamHeaders = buildUpstreamHeaders(request, account);
        if (stream) {
            SseForwardResult forwardResult = codexSseProxyForwardService.forward(updated, upstreamHeaders);
            CompletableFuture<CallLog> callLogFuture = forwardResult.usageFuture().thenApply(usage ->
                    buildCallLog(
                            usage,
                            true,
                            startAt,
                            userAgent,
                            clientIp,
                            account,
                            requestBody
                    )
            );
            writeCallLogAsync(callLogFuture);
            return forwardResult.emitter();
        }

        HttpForwardResult forwardResult = codexHttpProxyForwardService.forward(updated, upstreamHeaders);
        CallLog callLog = buildCallLog(
                forwardResult.usage(),
                false,
                startAt,
                userAgent,
                clientIp,
                account,
                requestBody
        );
        ResponseEntity<byte[]> response = ResponseEntity
                .status(forwardResult.statusCode())
                .body(forwardResult.responseBody());
        writeCallLogAsync(CompletableFuture.completedFuture(callLog));
        return response;
    }

    private CallLog buildCallLog(
            TokenUsage usage,
            boolean stream,
            long startAt,
            String userAgent,
            String clientIp,
            CodexAccountEntity account,
            JsonNode requestBody
    ) {
        double cacheRate = usage.inputTokens() > 0
                ? (double) usage.cachedInputTokens() / (double) usage.inputTokens()
                : 0.0;

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
                stream,
                requestBody
        );
    }

    private HttpHeaders buildUpstreamHeaders(HttpServletRequest request, CodexAccountEntity account) {
        HttpHeaders headers = new HttpHeaders();
        for (String key : UPSTREAM_HEADER_WHITELIST) {
            Enumeration<String> values = request.getHeaders(key);
            while (values.hasMoreElements()) {
                headers.add(key, values.nextElement());
            }
        }
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + account.getToken());
        headers.set(HEADER_CHATGPT_ACCOUNT_ID, account.getAccountId());
        return headers;
    }

    private CodexAccountEntity selectAccount(String stickyKey) {
        List<CodexAccountEntity> accounts = codexAccountMapper.selectList(
                Wrappers.<CodexAccountEntity>lambdaQuery()
                        .gt(CodexAccountEntity::getExpiresAt, OffsetDateTime.now())
                        .orderByAsc(CodexAccountEntity::getCreatedAt)
        );
        if (accounts.isEmpty()) {
            throw new NoAvailableAccountException();
        }

        boolean hasSticky = stickyKey != null && !stickyKey.isBlank();
        if (hasSticky) {
            BindingResult binding = stickySessionService.getBindingAccountId(stickyKey);
            if (binding.found()) {
                for (CodexAccountEntity account : accounts) {
                    if (account.getAccountId().equals(binding.accountId())) {
                        return account;
                    }
                }
                stickySessionService.deleteBinding(stickyKey);
            }
        }

        long counter = roundRobinCounter.getAndIncrement();
        int index = (int) Math.floorMod(counter, accounts.size());
        CodexAccountEntity selected = accounts.get(index);
        if (hasSticky) {
            stickySessionService.setBinding(stickyKey, selected.getAccountId());
        }
        return selected;
    }

    private static String trim(String raw) {
        return raw == null ? "" : raw.trim();
    }

    private void writeCallLogAsync(CompletableFuture<CallLog> callLogFuture) {
        callLogFuture.whenComplete((callLog, ex) -> {
            if (ex != null) {
                log.warn("写入 /api/responses 调用日志失败: {}", ex.getMessage());
                return;
            }

            try {
                responseLogService.writeCallLog(callLog);
            } catch (Exception writeEx) {
                log.warn("写入 /api/responses 调用日志失败: {}", writeEx.getMessage());
            }
        });
    }
}
