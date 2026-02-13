package com.github.kzw200015.myapi.codex.model.entity;

import java.time.OffsetDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.github.kzw200015.myapi.common.mybatis.JsonbTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

/**
 * codex_accounts 表模型。
 */
@TableName(value = "codex_accounts", autoResultMap = true)
@Getter
@Setter
public class CodexAccountEntity {
    @TableId(value = "id", type = IdType.AUTO)
    @Setter(AccessLevel.NONE)
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
}
