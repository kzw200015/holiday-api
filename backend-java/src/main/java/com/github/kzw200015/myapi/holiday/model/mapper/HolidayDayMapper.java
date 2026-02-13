package com.github.kzw200015.myapi.holiday.model.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.github.kzw200015.myapi.holiday.model.entity.HolidayDayEntity;

@Mapper
public interface HolidayDayMapper extends BaseMapper<HolidayDayEntity> {
}
