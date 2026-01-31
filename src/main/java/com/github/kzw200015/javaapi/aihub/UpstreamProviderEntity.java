package com.github.kzw200015.javaapi.aihub;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.github.kzw200015.javaapi.common.mybatis.JsonbTypeHandler;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Codex 凭证表。
 */
@Data
@TableName(value = "upstream_provider", autoResultMap = true)
public class UpstreamProviderEntity {

    @TableId(value = "id", type = IdType.INPUT)
    private UUID id;

    @TableField("auth_type")
    private String authType;

    @TableField(value = "oauth_json", typeHandler = JsonbTypeHandler.class)
    private Map<String, Object> oauthJson;

    @TableField("create_time")
    private OffsetDateTime createTime;
}
