package com.github.kzw200015.myapi.holiday.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.kzw200015.myapi.holiday.dao.entity.HolidayDayEntity;
import com.github.kzw200015.myapi.holiday.dao.mapper.HolidayDayMapper;
import com.github.kzw200015.myapi.holiday.dto.NextOffDayResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 节假日领域服务：启动时初始化当年与下一年的节假日数据。
 */
@Service
@RequiredArgsConstructor
public class HolidayService extends ServiceImpl<HolidayDayMapper, HolidayDayEntity> {
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;

    private final HolidayRemoteClient holidayRemoteClient;

    public boolean isHoliday(LocalDate date) {
        String dateText = date.format(DATE_FORMATTER);
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
                return new NextOffDayResult(candidate.format(DATE_FORMATTER), days);
            }
        }
    }

    public void initCurrentAndNextYear() {
        int currentYear = LocalDate.now().getYear();
        refreshYearDays(currentYear);
        refreshYearDays(currentYear + 1);
    }

    private void refreshYearDays(int year) {
        List<HolidayRemoteClient.HolidayDaySnapshot> days = holidayRemoteClient.fetchYearDays(year);
        remove(Wrappers.<HolidayDayEntity>lambdaQuery().likeRight(HolidayDayEntity::getDate, year + "-"));
        if (days.isEmpty()) {
            return;
        }

        days.stream().map(item -> {
            HolidayDayEntity entity = new HolidayDayEntity();
            entity.setName(item.name());
            entity.setDate(item.date());
            entity.setOffDay(item.isOffDay());
            return entity;
        }).forEach(this::save);
    }

}
