package com.github.kzw200015.myapi.codex.dao.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AccessLevel;
import lombok.Data;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * codex_prompt_config 表模型。
 */
@TableName(value = "codex_prompt_config", autoResultMap = true)
@Data
public class CodexPromptConfigEntity {
    @TableId(value = "id", type = IdType.INPUT)
    @Setter(AccessLevel.NONE)
    private Integer id;

    @TableField("source")
    private String source;

    @TableField("custom_prompt")
    private String customPrompt;

    @TableField("force_override")
    private boolean forceOverride;

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;
}
