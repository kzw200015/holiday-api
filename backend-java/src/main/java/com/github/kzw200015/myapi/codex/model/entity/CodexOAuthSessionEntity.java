package com.github.kzw200015.myapi.codex.model.entity;

import java.time.OffsetDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AccessLevel;
import lombok.Data;
import lombok.Setter;

/**
 * codex_oauth_sessions 表模型。
 */
@TableName(value = "codex_oauth_sessions", autoResultMap = true)
@Data
public class CodexOAuthSessionEntity {
    @TableId(value = "id", type = IdType.AUTO)
    @Setter(AccessLevel.NONE)
    private Integer id;

    @TableField("state")
    private String state;

    @TableField("code_verifier")
    private String codeVerifier;

    @TableField("code_challenge")
    private String codeChallenge;

    @TableField("expires_at")
    private OffsetDateTime expiresAt;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
