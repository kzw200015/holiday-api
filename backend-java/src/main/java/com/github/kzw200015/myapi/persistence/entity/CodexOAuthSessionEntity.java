package com.github.kzw200015.myapi.persistence.entity;

import java.time.OffsetDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

/**
 * codex_oauth_sessions 表模型。
 */
@TableName("codex_oauth_sessions")
public class CodexOAuthSessionEntity {
    @TableId(value = "id", type = IdType.AUTO)
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

    public Integer getId() {
        return id;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getCodeVerifier() {
        return codeVerifier;
    }

    public void setCodeVerifier(String codeVerifier) {
        this.codeVerifier = codeVerifier;
    }

    public String getCodeChallenge() {
        return codeChallenge;
    }

    public void setCodeChallenge(String codeChallenge) {
        this.codeChallenge = codeChallenge;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
