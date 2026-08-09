package io.github.kzw200015.myapi.holiday

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.DayOfWeek
import java.time.LocalDate

/**
 * 节假日业务逻辑。
 */
@Service
class HolidayService(
    private val holidayDayRepository: HolidayDayRepository,
    private val holidayRemoteClient: HolidayRemoteClient,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * 查询指定日期是否为休息日及对应的节假日名称：
     * 先查库，无记录则按周末判断（此时名称为空）。
     */
    fun query(date: LocalDate): HolidayQueryResult {
        // LocalDate.toString() 即 ISO 的 YYYY-MM-DD
        val dateText = date.toString()

        val day = holidayDayRepository.findByDate(dateText)
        if (day != null) {
            return HolidayQueryResult(date = dateText, isOffDay = day.isOffDay, name = day.name)
        }

        // 无记录，按周末判断
        val isWeekend = date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY
        return HolidayQueryResult(date = dateText, isOffDay = isWeekend, name = "")
    }

    /**
     * 刷新指定年份的节假日数据。
     * 远程拉取放在事务外，避免一次最长 60 秒的 HTTP 调用白占着数据库连接。
     */
    fun refreshYear(year: Int) {
        val remoteDays = holidayRemoteClient.fetchYearDays(year)
        holidayDayRepository.replaceYear(year, remoteDays)
        log.info("已刷新 {} 年节假日数据，共 {} 条", year, remoteDays.size)
    }
}
