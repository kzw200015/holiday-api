package com.github.kzw200015.javaapi.holiday;

import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * 从 holiday-cn 拉取假期数据。
 */
@Component
@Slf4j
public class HolidayFetcher {

    /** holiday-cn JSON 基础地址。 */
    private static final String BASE_URL = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/";

    private final RestTemplate restTemplate;
    private final JsonMapper jsonMapper;

    public HolidayFetcher(RestTemplate restTemplate, JsonMapper jsonMapper) {
        this.restTemplate = restTemplate;
        this.jsonMapper = jsonMapper;
    }

    /**
     * 获取指定年份的假期列表。
     */
    public List<Holiday> fetchYear(int year) {
        String requestUrl = BASE_URL + year + ".json";
        String response = restTemplate.getForObject(requestUrl, String.class);
        HolidayJson holidayJson = jsonMapper.readValue(response, HolidayJson.class);
        List<Holiday> holidays = holidayJson.days();
        log.info("获取假期数据成功：year={}, count={}", year, holidays.size());
        return holidays;
    }
}
