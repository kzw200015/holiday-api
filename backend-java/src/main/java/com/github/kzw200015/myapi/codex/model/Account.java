package com.github.kzw200015.myapi.codex.model;

import java.time.OffsetDateTime;

import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;

/**
 * Codex OAuth 账户返回结构。
 */
public record Account(
    String name,
    String accountId,
    String token,
    OffsetDateTime expiresAt,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
    public static Account from(CodexAccountEntity entity) {
        return new Account(
            entity.getName(),
            entity.getAccountId(),
            entity.getToken(),
            entity.getExpiresAt(),
            entity.getCreatedAt(),
            entity.getUpdatedAt()
        );
    }
}
