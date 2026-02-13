package com.github.kzw200015.myapi.persistence.entity;

import java.time.OffsetDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.github.kzw200015.myapi.persistence.JsonbTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * codex_accounts 表模型。
 */
@TableName(value = "codex_accounts", autoResultMap = true)
public class CodexAccountEntity {
    @TableId(value = "id", type = IdType.AUTO)
    private Integer id;

    @TableField("name")
    private String name;

    @TableField("account_id")
    private String accountId;

    @TableField("token")
    private String token;

    @TableField("expires_at")
    private OffsetDateTime expiresAt;

    @TableField(value = "oauth_payload", typeHandler = JsonbTypeHandler.class)
    private JsonNode oauthPayload;

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;

    public Integer getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getAccountId() {
        return accountId;
    }

    public void setAccountId(String accountId) {
        this.accountId = accountId;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public JsonNode getOauthPayload() {
        return oauthPayload;
    }

    public void setOauthPayload(JsonNode oauthPayload) {
        this.oauthPayload = oauthPayload;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
