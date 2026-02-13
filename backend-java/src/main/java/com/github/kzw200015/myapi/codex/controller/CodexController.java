package com.github.kzw200015.myapi.codex.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.github.kzw200015.myapi.common.model.ApiResponse;
import com.github.kzw200015.myapi.codex.service.CodexService;
import com.github.kzw200015.myapi.codex.model.UpdateAccountRequest;
import com.github.kzw200015.myapi.codex.service.ResponseLogService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/codex")
@RequiredArgsConstructor
public class CodexController {
    private final CodexService codexService;
    private final ResponseLogService responseLogService;

    @PostMapping("/oauth/session")
    public ApiResponse<?> createOAuthSession() {
        return ApiResponse.ok(codexService.createOAuthSession());
    }

    @PostMapping("/oauth/complete")
    public ApiResponse<?> completeOAuth(@RequestBody CompleteOAuthRequest request) {
        if (request == null || request.name() == null || request.name().isBlank() || request.redirectUrl() == null || request.redirectUrl().isBlank()) {
            throw new IllegalArgumentException("请求参数错误");
        }

        return ApiResponse.ok(codexService.completeOAuth(request.name(), request.redirectUrl()));
    }

    @GetMapping("/accounts")
    public ApiResponse<?> listAccounts(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "10") int pageSize
    ) {
        if (page < 1 || pageSize < 1 || pageSize > 200) {
            throw new IllegalArgumentException("请求参数错误");
        }

        return ApiResponse.ok(codexService.listAccountsPage(page, pageSize));
    }

    @PutMapping("/accounts/{accountId}")
    public ApiResponse<?> updateAccount(
        @PathVariable("accountId") String accountId,
        @RequestBody UpdateAccountRequest request
    ) {
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("请求参数错误");
        }

        return ApiResponse.ok(codexService.updateAccount(accountId, request));
    }

    @GetMapping("/response-logs")
    public ApiResponse<?> listResponseLogs(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int pageSize
    ) {
        if (page < 1 || pageSize < 1 || pageSize > 200) {
            throw new IllegalArgumentException("请求参数错误");
        }

        return ApiResponse.ok(responseLogService.listResponseLogsPage(page, pageSize));
    }
}
