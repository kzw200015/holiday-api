package com.github.kzw200015.javaapi.holiday;

import org.redisson.api.RMap;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Redis 假期存储，按日期索引。
 */
@Component
public class HolidayStore {

    private static final String KEY_HOLIDAYS_BY_DATE = "myapi:holiday:by-date";

    private final RedissonClient redissonClient;
    private final JsonMapper jsonMapper;

    public HolidayStore(RedissonClient redissonClient, JsonMapper jsonMapper) {
        this.redissonClient = redissonClient;
        this.jsonMapper = jsonMapper;
    }

    /**
     * 用新列表替换全部数据。
     */
    public void replaceAll(List<Holiday> holidays) {
        final String tmpKey = KEY_HOLIDAYS_BY_DATE + ":tmp:" + newSnapshotId();
        try {
            final RMap<String, String> map = redissonClient.getMap(tmpKey, StringCodec.INSTANCE);
            for (Holiday holiday : holidays) {
                map.put(holiday.date(), jsonMapper.writeValueAsString(holiday));
            }

            redissonClient.getKeys().rename(tmpKey, KEY_HOLIDAYS_BY_DATE);
        } catch (Exception ex) {
            redissonClient.getKeys().delete(tmpKey);
            throw new IllegalStateException("写入假期缓存失败", ex);
        }
    }

    /**
     * 根据日期查找假期。
     */
    public Holiday findByDate(String date) {
        try {
            final RMap<String, String> map = redissonClient.getMap(KEY_HOLIDAYS_BY_DATE, StringCodec.INSTANCE);
            final String json = map.get(date);
            return json == null ? null : jsonMapper.readValue(json, Holiday.class);
        } catch (Exception ex) {
            throw new IllegalStateException("读取假期缓存失败", ex);
        }
    }

    /**
     * 判断存储是否为空。
     */
    public boolean isEmpty() {
        return redissonClient.<String, String>getMap(KEY_HOLIDAYS_BY_DATE, StringCodec.INSTANCE).isEmpty();
    }

    /**
     * 获取当前记录数量。
     */
    public int size() {
        return redissonClient.<String, String>getMap(KEY_HOLIDAYS_BY_DATE, StringCodec.INSTANCE).size();
    }

    private static String newSnapshotId() {
        final long now = System.currentTimeMillis();
        final int rand = ThreadLocalRandom.current().nextInt();
        return Long.toString(now, 36) + "-" + Integer.toUnsignedString(rand, 36);
    }
}
