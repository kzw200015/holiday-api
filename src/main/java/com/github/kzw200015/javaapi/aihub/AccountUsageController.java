package com.github.kzw200015.javaapi.aihub;

import com.github.kzw200015.javaapi.common.ApiResponse;
import com.github.kzw200015.javaapi.common.PageResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Codex 账号相关：用量查询接口。
 */
@RestController
@RequestMapping("/api/account/usage")
public class AccountUsageController {

    private final AccountUsageService usageService;

    public AccountUsageController(AccountUsageService usageService) {
        this.usageService = usageService;
    }

    @GetMapping("/list")
    public ApiResponse<PageResult<AccountUsageListItem>> list(
            @RequestParam(defaultValue = "1") int current,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ApiResponse.success(usageService.listPage(current, size));
    }
}
