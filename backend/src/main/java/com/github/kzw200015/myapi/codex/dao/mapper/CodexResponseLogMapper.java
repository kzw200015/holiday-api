package com.github.kzw200015.myapi.codex.dao.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.github.kzw200015.myapi.codex.dao.entity.CodexResponseLogEntity;
import com.github.kzw200015.myapi.codex.dto.log.TodayTokenUsage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.OffsetDateTime;

@Mapper
public interface CodexResponseLogMapper extends BaseMapper<CodexResponseLogEntity> {
    TodayTokenUsage selectTodayTokenUsage(
            @Param("startTime") OffsetDateTime startTime,
            @Param("endTime") OffsetDateTime endTime
    );
}
