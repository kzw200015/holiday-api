package com.github.kzw200015.javaapi.holiday;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * holiday-cn 的响应结构。
 *
 * @param days 假期列表
 */
public record HolidayJson(
        @JsonProperty("days")
        List<Holiday> days
) {
}
