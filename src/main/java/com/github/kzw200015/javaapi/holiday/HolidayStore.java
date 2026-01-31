package com.github.kzw200015.javaapi.holiday;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 内存假期存储，按日期索引。
 */
public final class HolidayStore {

    /** 日期到假期的映射快照，读路径无锁。 */
    private static volatile Map<String, Holiday> holidaysByDate = Map.of();

    private HolidayStore() {
    }

    /**
     * 用新列表替换全部数据。
     */
    public static void replaceAll(List<Holiday> holidays) {
        final Map<String, Holiday> byDate = new HashMap<>(holidays.size());
        for (Holiday holiday : holidays) {
            byDate.put(holiday.date(), holiday);
        }
        holidaysByDate = Map.copyOf(byDate);
    }

    /**
     * 根据日期查找假期。
     */
    public static Holiday findByDate(String date) {
        return holidaysByDate.get(date);
    }

    /**
     * 判断存储是否为空。
     */
    public static boolean isEmpty() {
        return holidaysByDate.isEmpty();
    }

    /**
     * 获取当前记录数量。
     */
    public static int size() {
        return holidaysByDate.size();
    }
}
