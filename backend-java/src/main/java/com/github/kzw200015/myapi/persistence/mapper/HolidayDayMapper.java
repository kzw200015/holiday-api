package com.github.kzw200015.myapi.persistence.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.github.kzw200015.myapi.persistence.entity.HolidayDayEntity;

@Mapper
public interface HolidayDayMapper extends BaseMapper<HolidayDayEntity> {
}
