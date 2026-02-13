package com.github.kzw200015.myapi.persistence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

/**
 * holiday_days 表模型。
 */
@TableName("holiday_days")
public class HolidayDayEntity {
    @TableId(value = "id", type = IdType.AUTO)
    private Integer id;

    @TableField("name")
    private String name;

    @TableField("date")
    private String date;

    @TableField("is_off_day")
    private boolean isOffDay;

    public Integer getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDate() {
        return date;
    }

    public void setDate(String date) {
        this.date = date;
    }

    public boolean isOffDay() {
        return isOffDay;
    }

    public void setOffDay(boolean offDay) {
        isOffDay = offDay;
    }
}
