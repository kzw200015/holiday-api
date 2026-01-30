package com.github.kzw200015.javaapi.holiday;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 单日假期定义。
 *
 * @param name 节假日名称
 * @param date 日期字符串，格式为 yyyy-MM-dd
 * @param isOffDay 是否为休息日
 */
public record Holiday(
        @JsonProperty("name")
        String name,
        @JsonProperty("date")
        String date,
        @JsonProperty("isOffDay")
        boolean isOffDay
) {
}
