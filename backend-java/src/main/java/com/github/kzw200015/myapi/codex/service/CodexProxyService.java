package com.github.kzw200015.myapi.codex.service;

import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import tools.jackson.databind.node.ObjectNode;

import java.util.Enumeration;
import java.util.List;
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

    private final CodexHttpProxyForwardService codexHttpProxyForwardService;
    private final CodexSseProxyForwardService codexSseProxyForwardService;
    private final CodexPromptInstructionService codexPromptInstructionService;
    private final CodexAccountSelectionService codexAccountSelectionService;
    private final StickySessionService stickySessionService;

    /**
     * 处理 /api/responses 请求并转发到上游。
     */
    public Object proxyResponses(HttpServletRequest request, ObjectNode requestBody) {
        String clientIp = trimToEmpty(request.getRemoteAddr());
        String userAgent = trimToEmpty(request.getHeader(HttpHeaders.USER_AGENT));

        boolean stream = requestBody.path("stream").asBoolean(false);
        String promptCacheKey = trimToEmpty(requestBody.path("prompt_cache_key").asText());
        if (promptCacheKey.isBlank()) {
            log.warn("请求缺少 prompt_cache_key");
        }

        codexPromptInstructionService.applyPromptInstructions(requestBody);
        requestBody.remove("max_output_tokens");

        String stickyKey = stickySessionService.extractKey(request, promptCacheKey);
        CodexAccountEntity account = codexAccountSelectionService.selectAvailableAccount(stickyKey);

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

    private static String trimToEmpty(String raw) {
        return raw == null ? "" : raw.trim();
    }
}
