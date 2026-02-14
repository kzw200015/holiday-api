package com.github.kzw200015.myapi.codex.service;

import com.github.kzw200015.myapi.codex.model.Account;
import com.github.kzw200015.myapi.codex.model.CodexAccountQuota;
import com.github.kzw200015.myapi.codex.model.CodexQuotaAdditionalLimit;
import com.github.kzw200015.myapi.codex.model.CodexQuotaRateLimit;
import com.github.kzw200015.myapi.codex.model.CodexQuotaWindow;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.util.JsonNodeReadUtils;
import com.github.kzw200015.myapi.common.executor.ThreadPoolManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

@Service
@Slf4j
public class CodexQuotaService {
    private static final String CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
    private static final String CODEX_USAGE_USER_AGENT = "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal";

    private final RestClient restClient;
    private final JsonMapper jsonMapper;
    private final ThreadPoolManager threadPoolManager;

    public CodexQuotaService(RestClient restClient, JsonMapper jsonMapper, ThreadPoolManager threadPoolManager) {
        this.restClient = restClient;
        this.jsonMapper = jsonMapper;
        this.threadPoolManager = threadPoolManager;
    }

    public List<Account> buildAccountsWithQuota(List<CodexAccountEntity> entities) {
        List<CompletableFuture<Account>> futures = entities.stream()
                .map(entity -> CompletableFuture.supplyAsync(() -> buildAccountWithQuota(entity), threadPoolManager.getCodexQuotaExecutor()))
                .toList();
        return futures.stream().map(CompletableFuture::join).toList();
    }

    public CodexAccountQuota queryAccountQuota(CodexAccountEntity entity) {
        String raw;
        try {
            raw = restClient.get()
                    .uri(CODEX_USAGE_URL)
                    .accept(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + entity.getToken())
                    .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .header("User-Agent", CODEX_USAGE_USER_AGENT)
                    .header("Chatgpt-Account-Id", entity.getAccountId())
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException ex) {
            throw new IllegalArgumentException("查询配额失败: status=" + ex.getStatusCode().value());
        }

        if (raw == null) {
            throw new IllegalArgumentException("查询配额失败: 响应为空");
        }

        JsonNode payload = jsonMapper.readTree(raw);
        CodexQuotaRateLimit rateLimit = parseQuotaRateLimit(payload.get("rate_limit"));
        CodexQuotaRateLimit codeReviewRateLimit = parseQuotaRateLimit(payload.get("code_review_rate_limit"));
        List<CodexQuotaAdditionalLimit> additionalRateLimits = parseAdditionalRateLimits(payload.get("additional_rate_limits"));

        return new CodexAccountQuota(
                JsonNodeReadUtils.readString(payload, "plan_type"),
                rateLimit,
                codeReviewRateLimit,
                additionalRateLimits
        );
    }

    private Account buildAccountWithQuota(CodexAccountEntity entity) {
        try {
            return Account.from(entity, queryAccountQuota(entity));
        } catch (Exception ex) {
            log.warn("查询账号配额失败 accountId={}: {}", entity.getAccountId(), ex.getMessage());
            return Account.from(entity);
        }
    }

    private CodexQuotaRateLimit parseQuotaRateLimit(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new CodexQuotaRateLimit(
                JsonNodeReadUtils.readBoolean(node, "allowed"),
                JsonNodeReadUtils.readBoolean(node, "limit_reached"),
                parseQuotaWindow(node.get("primary_window")),
                parseQuotaWindow(node.get("secondary_window"))
        );
    }

    private CodexQuotaWindow parseQuotaWindow(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new CodexQuotaWindow(
                JsonNodeReadUtils.readDouble(node, "used_percent"),
                JsonNodeReadUtils.readLong(node, "limit_window_seconds"),
                JsonNodeReadUtils.readLong(node, "reset_after_seconds"),
                JsonNodeReadUtils.readLong(node, "reset_at")
        );
    }

    private List<CodexQuotaAdditionalLimit> parseAdditionalRateLimits(JsonNode node) {
        if (node == null || node.isNull() || !node.isArray()) {
            return List.of();
        }
        List<CodexQuotaAdditionalLimit> limits = new ArrayList<>();
        for (JsonNode item : node) {
            limits.add(new CodexQuotaAdditionalLimit(
                    JsonNodeReadUtils.readString(item, "limit_name"),
                    JsonNodeReadUtils.readString(item, "metered_feature"),
                    parseQuotaRateLimit(item.get("rate_limit"))
            ));
        }
        return limits;
    }
}
