package com.github.kzw200015.myapi.codex.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 更新提示词配置请求结构。
 */
public record UpdatePromptConfigRequest(
    @NotBlank String source,
    @NotNull String customPrompt,
    @NotNull Boolean forceOverride
) {}
