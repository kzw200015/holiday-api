package com.github.kzw200015.myapi.codex.dto.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 更新账户信息请求结构。
 */
public record UpdateAccountRequest(@NotBlank String name, @NotNull Boolean enabled) {}
