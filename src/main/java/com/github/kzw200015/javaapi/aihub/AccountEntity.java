package com.github.kzw200015.javaapi.aihub;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexOAuthToken;
import com.github.kzw200015.javaapi.common.mybatis.JsonbTypeHandler;
import lombok.Data;
import lombok.experimental.Accessors;

import java.time.OffsetDateTime;

/**
 * Codex 账号表。
 */
@Data
@TableName(value = "account", autoResultMap = true)
@Accessors(chain = true)
public class AccountEntity {

    @TableId(value = "id", type = IdType.ASSIGN_UUID)
    private String id;

    @TableField("name")
    private String name;

    @TableField("auth_type")
    private String authType;

    @TableField(value = "oauth_json", typeHandler = JsonbTypeHandler.class)
    private CodexOAuthToken oauthJson;

    /**
     * access_token 过期时间（timestamptz），冗余字段，用于快速过滤可用账号。
     */
    @TableField("access_token_expires_at")
    private OffsetDateTime accessTokenExpiresAt;

    @TableField("create_time")
    private OffsetDateTime createTime;
}
