package com.github.kzw200015.javaapi.aihub;

import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexOAuthToken;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexTokenRefreshScheduler;
import com.github.kzw200015.javaapi.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Codex 账号管理接口。
 */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;
    private final CodexTokenRefreshScheduler tokenRefreshScheduler;

    public record AccountListItem(String id, String name, String authType, OffsetDateTime createTime) {
    }

    public record AccountDetail(String id, String name, String authType, OffsetDateTime createTime,
                                CodexOAuthToken oauthJson) {
    }

    @GetMapping("/list")
    public ApiResponse<List<AccountListItem>> list() {
        final List<AccountEntity> entities = accountService.lambdaQuery()
                .orderByDesc(AccountEntity::getCreateTime)
                .list();

        final List<AccountListItem> items = entities.stream()
                .map(it -> new AccountListItem(it.getId(), it.getName(), it.getAuthType(), it.getCreateTime()))
                .toList();
        return ApiResponse.success(items);
    }

    @GetMapping("/{id}")
    public ApiResponse<AccountDetail> get(@PathVariable String id) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id 不能为空");
        }
        final AccountEntity entity = accountService.getById(id);
        if (entity == null) {
            throw new IllegalArgumentException("账号不存在");
        }
        return ApiResponse.success(new AccountDetail(entity.getId(), entity.getName(), entity.getAuthType(),
                entity.getCreateTime(), entity.getOauthJson()));
    }

    public record UpdateNameRequest(String name) {
    }

    @PutMapping("/{id}")
    public ApiResponse<Void> updateName(@PathVariable String id, @RequestBody UpdateNameRequest request) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id 不能为空");
        }
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("name 不能为空");
        }

        final AccountEntity entity = accountService.getById(id);
        if (entity == null) {
            throw new IllegalArgumentException("账号不存在");
        }
        entity.setName(request.name().trim());
        final boolean ok = accountService.updateById(entity);
        if (!ok) {
            throw new IllegalStateException("更新账号失败：id=" + id);
        }
        return ApiResponse.success(null);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id 不能为空");
        }
        final boolean removed = accountService.removeById(id);
        if (!removed) {
            throw new IllegalArgumentException("账号不存在");
        }
        return ApiResponse.success(null);
    }

    @PostMapping("/{id}/refresh-token")
    public ApiResponse<Void> refreshToken(@PathVariable String id) {
        tokenRefreshScheduler.refreshAccountToken(id);
        return ApiResponse.success(null);
    }
}
