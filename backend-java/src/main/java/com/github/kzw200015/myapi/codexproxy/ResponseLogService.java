package com.github.kzw200015.myapi.codexproxy;

import java.util.List;
import java.time.OffsetDateTime;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.kzw200015.myapi.pagination.PaginatedResult;
import com.github.kzw200015.myapi.persistence.entity.CodexResponseLogEntity;
import com.github.kzw200015.myapi.persistence.mapper.CodexResponseLogMapper;

@Service
public class ResponseLogService {
    private final CodexResponseLogMapper mapper;

    public ResponseLogService(CodexResponseLogMapper mapper) {
        this.mapper = mapper;
    }

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
            new QueryWrapper<CodexResponseLogEntity>().orderByDesc("created_at").orderByDesc("id")
        );
        List<CodexResponseLogItem> items = pageResult.getRecords().stream().map(CodexResponseLogItem::from).toList();
        return new PaginatedResult<>(items, pageResult.getTotal(), page, pageSize);
    }
}
