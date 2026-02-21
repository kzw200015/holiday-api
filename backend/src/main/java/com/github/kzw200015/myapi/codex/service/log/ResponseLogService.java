package com.github.kzw200015.myapi.codex.service.log;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.kzw200015.myapi.codex.dao.entity.CodexResponseLogEntity;
import com.github.kzw200015.myapi.codex.dao.mapper.CodexResponseLogMapper;
import com.github.kzw200015.myapi.codex.dto.log.CallLog;
import com.github.kzw200015.myapi.codex.dto.log.CodexResponseLogItem;
import com.github.kzw200015.myapi.codex.dto.log.TodayTokenUsage;
import com.github.kzw200015.myapi.common.model.PaginatedResult;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;

@Service
public class ResponseLogService extends ServiceImpl<CodexResponseLogMapper, CodexResponseLogEntity> {

    public void writeCallLog(CallLog callLog) {
        CodexResponseLogEntity entity = new CodexResponseLogEntity();
        entity.setUserAgent(callLog.userAgent());
        entity.setClientIp(callLog.clientIp());
        entity.setInputTokens(callLog.inputTokens());
        entity.setCachedInputTokens(callLog.cachedInputTokens());
        entity.setOutputTokens(callLog.outputTokens());
        entity.setCacheRate(callLog.cacheRate());
        entity.setFirstTokenLatencyMs(callLog.firstTokenLatencyMs());
        entity.setDurationMs(callLog.durationMs());
        entity.setAccountId(callLog.accountId());
        entity.setAccountName(callLog.accountName());
        entity.setSse(callLog.isSse());
        entity.setModel(callLog.model());
        entity.setRequestBody(callLog.requestBody());
        entity.setCreatedAt(OffsetDateTime.now());
        save(entity);
    }

    public PaginatedResult<CodexResponseLogItem> listResponseLogsPage(int page, int pageSize) {
        Page<CodexResponseLogEntity> pageResult = baseMapper.selectPage(
                Page.of(page, pageSize),
                Wrappers.<CodexResponseLogEntity>lambdaQuery()
                        .orderByDesc(CodexResponseLogEntity::getCreatedAt)
                        .orderByDesc(CodexResponseLogEntity::getId)
        );
        List<CodexResponseLogItem> items = pageResult.getRecords().stream().map(CodexResponseLogItem::from).toList();
        return new PaginatedResult<>(items, pageResult.getTotal(), page, pageSize);
    }

    public TodayTokenUsage getTodayTokenUsage() {
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime startTime = now.toLocalDate().atStartOfDay().atOffset(now.getOffset());
        OffsetDateTime endTime = startTime.plusDays(1);
        return baseMapper.selectTodayTokenUsage(startTime, endTime);
    }

    public void deleteLogsBefore(OffsetDateTime cutoffTime) {
        baseMapper.delete(
                Wrappers.<CodexResponseLogEntity>lambdaQuery()
                        .lt(CodexResponseLogEntity::getCreatedAt, cutoffTime)
        );
    }
}
