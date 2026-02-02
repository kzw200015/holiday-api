package com.github.kzw200015.javaapi.aihub;

import com.github.kzw200015.javaapi.common.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Codex 账号相关：用量查询接口。
 */
@RestController
@RequestMapping("/api/account/usage")
public class AccountUsageController {

    private static final int DEFAULT_LIMIT = 200;
    private static final int MAX_LIMIT = 500;

    private final AccountUsageService usageService;
    private final AccountService accountService;

    public record AccountUsageListItem(
            String id,
            String accountId,
            String accountName,
            boolean stream,
            Integer upstreamStatus,
            Integer inputTokens,
            Integer cachedInputTokens,
            Integer outputTokens,
            int costMs,
            java.time.OffsetDateTime createTime
    ) {
    }

    public AccountUsageController(AccountUsageService usageService, AccountService accountService) {
        this.usageService = usageService;
        this.accountService = accountService;
    }

    @GetMapping("/list")
    public ApiResponse<List<AccountUsageListItem>> list(@RequestParam(required = false) Integer limit) {
        final int size = normalizeLimit(limit);

        final List<AccountUsageEntity> logs = usageService.lambdaQuery()
                .orderByDesc(AccountUsageEntity::getCreateTime)
                .last("limit " + size)
                .list();

        final Set<String> accountIds = logs.stream()
                .map(AccountUsageEntity::getAccountId)
                .filter(it -> it != null && !it.isBlank())
                .collect(Collectors.toSet());

        final Map<String, String> accountNameById = accountService.listByIds(accountIds).stream()
                .collect(Collectors.toMap(AccountEntity::getId, AccountEntity::getName, (a, b) -> a));

        final List<AccountUsageListItem> items = logs.stream()
                .map(it -> new AccountUsageListItem(
                        it.getId(),
                        it.getAccountId(),
                        accountNameById.get(it.getAccountId()),
                        Boolean.TRUE.equals(it.getStream()),
                        it.getUpstreamStatus(),
                        it.getInputTokens(),
                        it.getCachedInputTokens(),
                        it.getOutputTokens(),
                        it.getCostMs() != null ? it.getCostMs() : 0,
                        it.getCreateTime()
                ))
                .toList();
        return ApiResponse.success(items);
    }

    private static int normalizeLimit(Integer limit) {
        if (limit == null || limit <= 0) {
            return DEFAULT_LIMIT;
        }
        if (limit > MAX_LIMIT) {
            return MAX_LIMIT;
        }
        return limit;
    }
}
