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
 * codex_response_logs 表模型。
 */
@TableName(value = "codex_response_logs", autoResultMap = true)
@Data
public class CodexResponseLogEntity {
    @TableId(value = "id", type = IdType.AUTO)
    @Setter(AccessLevel.NONE)
    private Integer id;

    @TableField("user_agent")
    private String userAgent;

    @TableField("client_ip")
    private String clientIp;

    @TableField("input_tokens")
    private int inputTokens;

    @TableField("cached_input_tokens")
    private int cachedInputTokens;

    @TableField("output_tokens")
    private int outputTokens;

    @TableField("cache_rate")
    private double cacheRate;

    @TableField("duration_ms")
    private int durationMs;

    @TableField("account_id")
    private String accountId;

    @TableField("account_name")
    private String accountName;

    @TableField("is_sse")
    private boolean isSse;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
