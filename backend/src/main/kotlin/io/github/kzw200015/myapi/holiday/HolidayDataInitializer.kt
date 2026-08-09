package io.github.kzw200015.myapi.holiday

import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.stereotype.Component
import java.time.Year

/**
 * 启动初始化：刷新当年和下一年的节假日数据，失败则中止启动。
 */
@Component
class HolidayDataInitializer(private val holidayService: HolidayService) : ApplicationRunner {

    override fun run(args: ApplicationArguments) {
        val currentYear = Year.now().value
        for (year in listOf(currentYear, currentYear + 1)) {
            holidayService.refreshYear(year)
        }
    }
}
