package com.github.kzw200015.myapi.codex.model.entity;

import java.time.OffsetDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

/**
 * codex_response_logs 表模型。
 */
@TableName("codex_response_logs")
public class CodexResponseLogEntity {
    @TableId(value = "id", type = IdType.AUTO)
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

    public Integer getId() {
        return id;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public String getClientIp() {
        return clientIp;
    }

    public void setClientIp(String clientIp) {
        this.clientIp = clientIp;
    }

    public int getInputTokens() {
        return inputTokens;
    }

    public void setInputTokens(int inputTokens) {
        this.inputTokens = inputTokens;
    }

    public int getCachedInputTokens() {
        return cachedInputTokens;
    }

    public void setCachedInputTokens(int cachedInputTokens) {
        this.cachedInputTokens = cachedInputTokens;
    }

    public int getOutputTokens() {
        return outputTokens;
    }

    public void setOutputTokens(int outputTokens) {
        this.outputTokens = outputTokens;
    }

    public double getCacheRate() {
        return cacheRate;
    }

    public void setCacheRate(double cacheRate) {
        this.cacheRate = cacheRate;
    }

    public int getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(int durationMs) {
        this.durationMs = durationMs;
    }

    public String getAccountId() {
        return accountId;
    }

    public void setAccountId(String accountId) {
        this.accountId = accountId;
    }

    public String getAccountName() {
        return accountName;
    }

    public void setAccountName(String accountName) {
        this.accountName = accountName;
    }

    public boolean isSse() {
        return isSse;
    }

    public void setSse(boolean sse) {
        isSse = sse;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
