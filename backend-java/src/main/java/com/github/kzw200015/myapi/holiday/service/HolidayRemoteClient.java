package com.github.kzw200015.myapi.holiday.service;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

@Service
@RequiredArgsConstructor
public class HolidayRemoteClient {
    private static final String BASE_URL = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master";

    private final JsonMapper jsonMapper;
    private final RestClient restClient;

    public List<HolidayDaySnapshot> fetchYearDays(int year) {
        String requestUrl = BASE_URL + "/" + year + ".json";
        String raw = restClient.get()
                .uri(requestUrl)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, resp) -> {
                    throw new IllegalStateException("请求假期数据失败: status=" + resp.getStatusCode().value());
                })
                .body(String.class);

        HolidayPayload payload = jsonMapper.readValue(raw, HolidayPayload.class);
        if (payload == null || payload.days() == null) {
            return List.of();
        }
        return payload.days();
    }

    public record HolidayDaySnapshot(String name, String date, boolean isOffDay) {}

    private record HolidayPayload(List<HolidayDaySnapshot> days) {}
}
