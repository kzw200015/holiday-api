package com.github.kzw200015.javaapi.aihub;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

import java.time.OffsetDateTime;

/**
 * Codex 接口调用用量表。
 */
@Data
@TableName(value = "account_usage")
@Accessors(chain = true)
public class AccountUsageEntity {

    @TableId(value = "id", type = IdType.ASSIGN_UUID)
    private String id;

    @TableField("account_id")
    private String accountId;

    @TableField("stream")
    private Boolean stream;

    @TableField("upstream_status")
    private Integer upstreamStatus;

    @TableField("input_tokens")
    private Integer inputTokens;

    @TableField("cached_input_tokens")
    private Integer cachedInputTokens;

    @TableField("output_tokens")
    private Integer outputTokens;

    @TableField("cost_ms")
    private Integer costMs;

    @TableField("create_time")
    private OffsetDateTime createTime;
}
