package com.github.kzw200015.myapi.codex.model;

import jakarta.validation.constraints.NotBlank;

/**
 * 更新账户信息请求结构。
 */
public record UpdateAccountRequest(@NotBlank String name) {}
