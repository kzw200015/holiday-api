package com.github.kzw200015.myapi.holiday;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.json.JsonMapper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.kzw200015.myapi.persistence.entity.HolidayDayEntity;
import com.github.kzw200015.myapi.persistence.mapper.HolidayDayMapper;

/**
 * 节假日领域服务：启动时初始化当年与下一年的节假日数据。
 */
@Service
public class HolidayService extends ServiceImpl<HolidayDayMapper, HolidayDayEntity> {
    public static final String DATE_LAYOUT = "yyyy-MM-dd";

    private static final String BASE_URL = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master";

    private final RestClient restClient;
    private final DateTimeFormatter dateFormatter;
    private final JsonMapper jsonMapper;

    public HolidayService(JsonMapper jsonMapper) {
        this.restClient = RestClient.create();
        this.dateFormatter = DateTimeFormatter.ofPattern(DATE_LAYOUT);
        this.jsonMapper = jsonMapper;
    }

    public boolean isHoliday(LocalDate date) {
        String dateText = date.format(dateFormatter);
        HolidayDayEntity found = lambdaQuery().eq(HolidayDayEntity::getDate, dateText).one();
        if (found != null) {
            return found.isOffDay();
        }

        DayOfWeek weekDay = date.getDayOfWeek();
        return weekDay == DayOfWeek.SATURDAY || weekDay == DayOfWeek.SUNDAY;
    }

    public NextOffDayResult queryNextOffDay(LocalDate date) {
        for (int days = 0; ; days++) {
            LocalDate candidate = date.plusDays(days);
            if (isHoliday(candidate)) {
                return new NextOffDayResult(candidate.format(dateFormatter), days);
            }
        }
    }

    public void initCurrentAndNextYear() {
        int currentYear = LocalDate.now(ZoneId.systemDefault()).getYear();
        refreshYearDays(currentYear);
        refreshYearDays(currentYear + 1);
    }

    private void refreshYearDays(int year) {
        List<RemoteHolidayDay> days = fetchYearDays(year);
        QueryWrapper<HolidayDayEntity> deleteWrapper = new QueryWrapper<HolidayDayEntity>().likeRight("date", year + "-");
        remove(deleteWrapper);
        if (days.isEmpty()) {
            return;
        }

        List<HolidayDayEntity> entities = days.stream().map(item -> {
            HolidayDayEntity entity = new HolidayDayEntity();
            entity.setName(item.name);
            entity.setDate(item.date);
            entity.setOffDay(item.isOffDay);
            return entity;
        }).toList();
        saveBatch(entities);
    }

    private List<RemoteHolidayDay> fetchYearDays(int year) {
        String requestUrl = BASE_URL + "/" + year + ".json";
        try {
            String raw = restClient.get()
                .uri(requestUrl)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, resp) -> {
                    throw new IllegalStateException("请求假期数据失败: status=" + resp.getStatusCode().value());
                })
                .body(String.class);

            HolidayPayload payload = jsonMapper.readValue(raw, HolidayPayload.class);
            if (payload == null || payload.days == null) {
                return List.of();
            }
            return payload.days;
        } catch (RestClientResponseException ex) {
            throw new IllegalStateException("请求假期数据失败: status=" + ex.getStatusCode().value(), ex);
        } catch (Exception ex) {
            throw new IllegalStateException("请求假期数据失败: " + ex.getMessage(), ex);
        }
    }

    static class HolidayPayload {
        public List<RemoteHolidayDay> days;
    }

    static class RemoteHolidayDay {
        public String name;
        public String date;
        public boolean isOffDay;
    }
}
