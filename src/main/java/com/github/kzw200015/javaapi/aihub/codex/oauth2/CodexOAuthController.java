package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import com.github.kzw200015.javaapi.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * Codex OAuth2 接口。
 */
@RestController
@RequestMapping("/api/codex/oauth2")
@RequiredArgsConstructor
public class CodexOAuthController {

    private final CodexOAuthService service;

    /**
     * 返回 OAuth2 授权地址（浏览器打开）。
     */
    @GetMapping("/authorize-url")
    public ApiResponse<CodexOAuthService.AuthorizeUrlResult> authorizeUrl() {
        return ApiResponse.success(service.createAuthorizeUrl());
    }

    /**
     * 接收回调 URL，完成 code -> token 交换。
     */

    public record CompleteRequest(String callbackUrl, String name) {
    }

    @PostMapping("/complete")
    public ApiResponse<Void> complete(@RequestBody CompleteRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        service.completeFromCallbackUrl(request.callbackUrl(), request.name());
        return ApiResponse.success(null);
    }
}
