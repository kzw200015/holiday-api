package com.github.kzw200015.myapi.httpapi;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.github.kzw200015.myapi.codex.CodexService;
import com.github.kzw200015.myapi.codex.UpdateAccountRequest;
import com.github.kzw200015.myapi.codexproxy.ResponseLogService;

@RestController
@RequestMapping("/api/codex")
public class CodexController {
    private final CodexService codexService;
    private final ResponseLogService responseLogService;

    public CodexController(CodexService codexService, ResponseLogService responseLogService) {
        this.codexService = codexService;
        this.responseLogService = responseLogService;
    }

    @PostMapping("/oauth/session")
    public ResponseEntity<ApiResponse<?>> createOAuthSession() {
        try {
            return ResponseEntity.ok(ApiResponse.ok(codexService.createOAuthSession()));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiResponse.internalServerError(ex.getMessage()));
        }
    }

    public record CompleteOAuthRequest(String name, String redirectUrl) {}

    @PostMapping("/oauth/complete")
    public ResponseEntity<ApiResponse<?>> completeOAuth(@RequestBody CompleteOAuthRequest request) {
        if (request == null || request.name() == null || request.name().isBlank() || request.redirectUrl() == null || request.redirectUrl().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.badRequest("请求参数错误"));
        }

        try {
            return ResponseEntity.ok(ApiResponse.ok(codexService.completeOAuth(request.name(), request.redirectUrl())));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.badRequest(ex.getMessage()));
        }
    }

    @GetMapping("/accounts")
    public ResponseEntity<ApiResponse<?>> listAccounts(
        @RequestParam(name = "page", defaultValue = "1") int page,
        @RequestParam(name = "pageSize", defaultValue = "10") int pageSize
    ) {
        if (page < 1 || pageSize < 1 || pageSize > 200) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.badRequest("请求参数错误"));
        }

        try {
            return ResponseEntity.ok(ApiResponse.ok(codexService.listAccountsPage(page, pageSize)));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiResponse.internalServerError(ex.getMessage()));
        }
    }

    @PutMapping("/accounts/{accountId}")
    public ResponseEntity<ApiResponse<?>> updateAccount(
        @PathVariable("accountId") String accountId,
        @RequestBody UpdateAccountRequest request
    ) {
        if (request == null || request.name() == null || request.name().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.badRequest("请求参数错误"));
        }

        try {
            return ResponseEntity.ok(ApiResponse.ok(codexService.updateAccount(accountId, request)));
        } catch (IllegalStateException ex) {
            if ("NOT_FOUND".equals(ex.getMessage())) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.notFound());
            }
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiResponse.internalServerError(ex.getMessage()));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiResponse.internalServerError(ex.getMessage()));
        }
    }

    @GetMapping("/response-logs")
    public ResponseEntity<ApiResponse<?>> listResponseLogs(
        @RequestParam(name = "page", defaultValue = "1") int page,
        @RequestParam(name = "pageSize", defaultValue = "20") int pageSize
    ) {
        if (page < 1 || pageSize < 1 || pageSize > 200) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.badRequest("请求参数错误"));
        }

        try {
            return ResponseEntity.ok(ApiResponse.ok(responseLogService.listResponseLogsPage(page, pageSize)));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiResponse.internalServerError("查询调用日志失败"));
        }
    }
}
