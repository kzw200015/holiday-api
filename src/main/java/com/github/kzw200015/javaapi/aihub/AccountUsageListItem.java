package com.github.kzw200015.javaapi.aihub;

import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 账号用量分页列表项。
 */
@Data
public class AccountUsageListItem {

    private String id;

    private String accountId;

    private String accountName;

    private String stream;

    private Integer upstreamStatus;

    private Integer inputTokens;

    private Integer cachedInputTokens;

    private Integer outputTokens;

    private Integer costMs;

    private OffsetDateTime createTime;
}
