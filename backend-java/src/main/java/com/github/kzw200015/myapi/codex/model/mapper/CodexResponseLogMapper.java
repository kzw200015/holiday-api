package com.github.kzw200015.myapi.codex.model.mapper;

import java.time.OffsetDateTime;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.github.kzw200015.myapi.codex.model.TodayTokenUsage;
import com.github.kzw200015.myapi.codex.model.entity.CodexResponseLogEntity;

@Mapper
public interface CodexResponseLogMapper extends BaseMapper<CodexResponseLogEntity> {
    TodayTokenUsage selectTodayTokenUsage(
        @Param("startTime") OffsetDateTime startTime,
        @Param("endTime") OffsetDateTime endTime
    );
}
