package com.github.kzw200015.myapi.codex.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;

import com.github.kzw200015.myapi.common.model.ApiResponse;
import com.github.kzw200015.myapi.common.model.PaginatedResult;
import com.github.kzw200015.myapi.codex.model.Account;
import com.github.kzw200015.myapi.codex.model.CodexResponseLogItem;
import com.github.kzw200015.myapi.codex.model.OAuthSessionInfo;
import com.github.kzw200015.myapi.codex.model.TodayTokenUsage;
import com.github.kzw200015.myapi.codex.service.CodexAccountService;
import com.github.kzw200015.myapi.codex.service.CodexOAuthService;
import com.github.kzw200015.myapi.codex.model.UpdateAccountRequest;
import com.github.kzw200015.myapi.codex.service.ResponseLogService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/codex")
@RequiredArgsConstructor
@Validated
public class CodexController {
    private final CodexAccountService codexAccountService;
    private final CodexOAuthService codexOAuthService;
    private final ResponseLogService responseLogService;

    @PostMapping("/oauth/session")
    public ApiResponse<OAuthSessionInfo> createCodexOAuthSession() {
        return ApiResponse.ok(codexOAuthService.createOAuthSession());
    }

    @PostMapping("/oauth/complete")
    public ApiResponse<Account> completeCodexOAuth(@RequestBody @NotNull @Valid CompleteOAuthRequest request) {
        return ApiResponse.ok(codexOAuthService.completeOAuth(request.name(), request.redirectUrl()));
    }

    @GetMapping("/accounts")
    public ApiResponse<PaginatedResult<Account>> listCodexAccounts(
        @RequestParam(defaultValue = "1") @Min(1) int page,
        @RequestParam(defaultValue = "10") @Min(1) @Max(200) int pageSize
    ) {
        return ApiResponse.ok(codexAccountService.listAccountsPage(page, pageSize));
    }

    @PutMapping("/accounts/{id}")
    public ApiResponse<Account> updateCodexAccount(
        @PathVariable("id") @Min(1) int id,
        @RequestBody @NotNull @Valid UpdateAccountRequest request
    ) {
        return ApiResponse.ok(codexAccountService.updateAccount(id, request));
    }

    @GetMapping("/response-logs")
    public ApiResponse<PaginatedResult<CodexResponseLogItem>> listCodexResponseLogs(
        @RequestParam(defaultValue = "1") @Min(1) int page,
        @RequestParam(defaultValue = "20") @Min(1) @Max(200) int pageSize
    ) {
        return ApiResponse.ok(responseLogService.listResponseLogsPage(page, pageSize));
    }

    @GetMapping("/today-token-usage")
    public ApiResponse<TodayTokenUsage> getTodayTokenUsage() {
        return ApiResponse.ok(responseLogService.getTodayTokenUsage());
    }
}
