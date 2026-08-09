package io.github.kzw200015.myapi.holiday

import com.baomidou.mybatisplus.core.mapper.BaseMapper
import org.apache.ibatis.annotations.Mapper

/**
 * holiday_days 表的数据访问接口，查询条件由 [HolidayService] 用 KtQueryWrapper 构造。
 */
@Mapper
interface HolidayDayMapper : BaseMapper<HolidayDay>
