package com.github.kzw200015.myapi.codex.service;

import java.util.List;
import java.time.OffsetDateTime;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.kzw200015.myapi.common.model.PaginatedResult;
import com.github.kzw200015.myapi.codex.model.CallLog;
import com.github.kzw200015.myapi.codex.model.CodexResponseLogItem;
import com.github.kzw200015.myapi.codex.model.entity.CodexResponseLogEntity;
import com.github.kzw200015.myapi.codex.model.mapper.CodexResponseLogMapper;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ResponseLogService {
    private final CodexResponseLogMapper mapper;

    public void writeCallLog(CallLog callLog) {
        CodexResponseLogEntity entity = new CodexResponseLogEntity();
        entity.setUserAgent(callLog.userAgent());
        entity.setClientIp(callLog.clientIp());
        entity.setInputTokens(callLog.inputTokens());
        entity.setCachedInputTokens(callLog.cachedInputTokens());
        entity.setOutputTokens(callLog.outputTokens());
        entity.setCacheRate(callLog.cacheRate());
        entity.setDurationMs(callLog.durationMs());
        entity.setAccountId(callLog.accountId());
        entity.setAccountName(callLog.accountName());
        entity.setSse(callLog.isSse());
        entity.setCreatedAt(OffsetDateTime.now());
        mapper.insert(entity);
    }

    public PaginatedResult<CodexResponseLogItem> listResponseLogsPage(int page, int pageSize) {
        Page<CodexResponseLogEntity> pageResult = mapper.selectPage(
            Page.of(page, pageSize),
            Wrappers.<CodexResponseLogEntity>lambdaQuery()
                    .orderByDesc(CodexResponseLogEntity::getCreatedAt)
                    .orderByDesc(CodexResponseLogEntity::getId)
        );
        List<CodexResponseLogItem> items = pageResult.getRecords().stream().map(CodexResponseLogItem::from).toList();
        return new PaginatedResult<>(items, pageResult.getTotal(), page, pageSize);
    }
}
