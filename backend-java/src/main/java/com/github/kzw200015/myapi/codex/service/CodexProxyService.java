package com.github.kzw200015.myapi.codex.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.github.kzw200015.myapi.codex.exception.NoAvailableAccountException;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.model.mapper.CodexAccountMapper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import tools.jackson.databind.node.ObjectNode;

import java.time.OffsetDateTime;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

/**
 * /api/responses 反向代理：按粘性会话 + 轮询选择账号，转发到上游 Codex responses。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CodexProxyService {
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
    private final CodexPromptInstructionService codexPromptInstructionService;
    private final StickySessionService stickySessionService;
    private final AtomicLong roundRobinCounter = new AtomicLong(0);

    /**
     * 处理 /api/responses 请求并转发到上游。
     */
    public Object proxyResponses(HttpServletRequest request, ObjectNode requestBody) {
        String clientIp = request.getRemoteAddr() == null ? "" : request.getRemoteAddr();
        String userAgent = request.getHeader(HttpHeaders.USER_AGENT) == null ? "" : request.getHeader(HttpHeaders.USER_AGENT).trim();

        boolean stream = requestBody.path("stream").asBoolean(false);
        String promptCacheKey = requestBody.path("prompt_cache_key").asString() == null ? "" : requestBody.path("prompt_cache_key").asString().trim();
        if (promptCacheKey.isBlank()) {
            log.warn("请求缺少 prompt_cache_key");
        }

        codexPromptInstructionService.applyPromptInstructions(requestBody);
        requestBody.remove("max_output_tokens");

        String stickyKey = stickySessionService.extractKey(request, promptCacheKey);
        CodexAccountEntity account = selectAccount(stickyKey);

        HttpHeaders upstreamHeaders = buildUpstreamHeaders(request, account, promptCacheKey);
        if (stream) {
            return codexSseProxyForwardService.forward(
                    requestBody,
                    upstreamHeaders,
                    userAgent,
                    clientIp,
                    account
            );
        }

        return codexHttpProxyForwardService.forward(
                requestBody,
                upstreamHeaders,
                userAgent,
                clientIp,
                account
        );
    }

    /**
     * 构建上游请求头，并在缺失时用 prompt_cache_key 补齐会话标识。
     */
    private HttpHeaders buildUpstreamHeaders(HttpServletRequest request, CodexAccountEntity account, String promptCacheKey) {
        HttpHeaders headers = new HttpHeaders();
        for (String key : UPSTREAM_HEADER_WHITELIST) {
            Enumeration<String> values = request.getHeaders(key);
            while (values.hasMoreElements()) {
                headers.add(key, values.nextElement());
            }
        }
        if (!promptCacheKey.isBlank()) {
            Stream.of(HEADER_CONVERSATION_ID, HEADER_SESSION_ID)
                    .filter(headerName -> !StringUtils.hasText(headers.getFirst(headerName)))
                    .forEach(headerName -> {
                        log.warn("请求头缺少 {}，已使用 prompt_cache_key 填充", headerName);
                        headers.set(headerName, promptCacheKey);
                    });
        }
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + account.getToken());
        headers.set(HEADER_CHATGPT_ACCOUNT_ID, account.getAccountId());
        return headers;
    }

    /**
     * 从可用账号中按粘性优先、轮询兜底选择转发账号。
     */
    private CodexAccountEntity selectAccount(String stickyKey) {
        List<CodexAccountEntity> accounts = codexAccountMapper.selectList(
                Wrappers.<CodexAccountEntity>lambdaQuery()
                        .eq(CodexAccountEntity::isEnabled, true)
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
        int index = Math.floorMod(counter, accounts.size());
        CodexAccountEntity selected = accounts.get(index);
        if (hasSticky) {
            stickySessionService.setBinding(stickyKey, selected.getAccountId());
        }
        return selected;
    }

}
