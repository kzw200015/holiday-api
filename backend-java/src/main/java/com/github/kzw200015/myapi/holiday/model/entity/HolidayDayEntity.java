package com.github.kzw200015.myapi.holiday.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AccessLevel;
import lombok.Data;
import lombok.Setter;

/**
 * holiday_days 表模型。
 */
@TableName(value = "holiday_days", autoResultMap = true)
@Data
public class HolidayDayEntity {
    @TableId(value = "id", type = IdType.AUTO)
    @Setter(AccessLevel.NONE)
    private Integer id;

    @TableField("name")
    private String name;

    @TableField("date")
    private String date;

    @TableField("is_off_day")
    private boolean isOffDay;
}
