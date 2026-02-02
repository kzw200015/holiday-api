package com.github.kzw200015.javaapi.aihub;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.kzw200015.javaapi.common.PageResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;

/**
 * Codex 账号用量存储服务。
 */
@Service
@Slf4j
public class AccountUsageService extends ServiceImpl<AccountUsageMapper, AccountUsageEntity> {

    public void saveUsage(String accountId, AccountUsageStreamType stream, Integer upstreamStatus,
                          Integer inputTokens, Integer cachedInputTokens, Integer outputTokens, long costMs) {
        if (accountId == null || accountId.isBlank()) {
            return;
        }

        final AccountUsageEntity entity = new AccountUsageEntity();
        entity.setAccountId(accountId);
        entity.setStream(stream.dbValue());
        entity.setUpstreamStatus(upstreamStatus);
        entity.setInputTokens(inputTokens);
        entity.setCachedInputTokens(cachedInputTokens);
        entity.setOutputTokens(outputTokens);
        entity.setCostMs(Math.toIntExact(costMs));
        entity.setCreateTime(OffsetDateTime.now());

        try {
            save(entity);
        } catch (Exception ex) {
            log.error("写入账号用量失败：accountId={}", accountId, ex);
        }
    }

    public PageResult<AccountUsageListItem> listPage(int current, int size) {
        final Page<AccountUsageListItem> page = Page.of(current, size);
        final Page<AccountUsageListItem> result = baseMapper.selectUsagePage(page);
        return new PageResult<>(
                Math.toIntExact(result.getCurrent()),
                Math.toIntExact(result.getSize()),
                result.getTotal(),
                result.getRecords()
        );
    }
}
