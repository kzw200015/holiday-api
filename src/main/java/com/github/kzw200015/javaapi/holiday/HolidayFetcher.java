package com.github.kzw200015.javaapi.holiday;

import java.io.IOException;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * 从 holiday-cn 拉取假期数据。
 */
@Component
@Slf4j
public class HolidayFetcher {

    /** holiday-cn JSON 基础地址。 */
    private static final String BASE_URL = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/";

    private final OkHttpClient okHttpClient;
    private final JsonMapper jsonMapper;

    public HolidayFetcher(OkHttpClient okHttpClient, JsonMapper jsonMapper) {
        this.okHttpClient = okHttpClient;
        this.jsonMapper = jsonMapper;
    }

    /**
     * 获取指定年份的假期列表。
     */
    public List<Holiday> fetchYear(int year) {
        final String requestUrl = BASE_URL + year + ".json";
        final String response = fetchText(requestUrl);
        final HolidayJson holidayJson = jsonMapper.readValue(response, HolidayJson.class);
        final List<Holiday> holidays = holidayJson.days();
        log.info("获取假期数据成功：year={}, count={}", year, holidays.size());
        return holidays;
    }

    private String fetchText(String url) {
        final Request request = new Request.Builder().url(url).build();
        try (final Response response = okHttpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IllegalStateException("请求失败：status=" + response.code());
            }
            final ResponseBody body = response.body();
            return body.string();
        } catch (IOException ex) {
            throw new IllegalStateException("请求失败", ex);
        }
    }
}
