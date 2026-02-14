package com.github.kzw200015.myapi.codex.model;

import java.time.OffsetDateTime;

import com.github.kzw200015.myapi.codex.model.entity.CodexPromptConfigEntity;

/**
 * Codex 提示词配置返回结构。
 */
public record CodexPromptConfig(
    String source,
    String customPrompt,
    boolean forceOverride,
    OffsetDateTime updatedAt
) {
    public static CodexPromptConfig from(CodexPromptConfigEntity entity) {
        return new CodexPromptConfig(
            entity.getSource(),
            entity.getCustomPrompt(),
            entity.isForceOverride(),
            entity.getUpdatedAt()
        );
    }
}
