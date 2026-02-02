package com.github.kzw200015.javaapi.aihub;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Mapper;

/**
 * Codex 账号用量 Mapper。
 */
@Mapper
public interface AccountUsageMapper extends BaseMapper<AccountUsageEntity> {

    Page<AccountUsageListItem> selectUsagePage(@Param("page") Page<AccountUsageListItem> page);
}
