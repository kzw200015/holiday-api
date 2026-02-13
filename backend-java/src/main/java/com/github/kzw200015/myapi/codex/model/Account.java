package com.github.kzw200015.myapi.codex.model;

import java.time.OffsetDateTime;

import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;

/**
 * Codex OAuth 账户返回结构。
 */
public record Account(
    int id,
    String name,
    String token,
    boolean enabled,
    OffsetDateTime expiresAt,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt,
    CodexAccountQuota quota
) {
    public static Account from(CodexAccountEntity entity) {
        return from(entity, null);
    }

    public static Account from(CodexAccountEntity entity, CodexAccountQuota quota) {
        return new Account(
            entity.getId(),
            entity.getName(),
            entity.getToken(),
            entity.isEnabled(),
            entity.getExpiresAt(),
            entity.getCreatedAt(),
            entity.getUpdatedAt(),
            quota
        );
    }
}
