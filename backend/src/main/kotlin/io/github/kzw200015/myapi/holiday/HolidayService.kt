package io.github.kzw200015.myapi.holiday

import io.github.kzw200015.myapi.concurrently
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.Year
import java.time.ZoneId

/** 节假日安排是中国的：「今天」「今年」一律按北京时间算，不跟着服务器的时区走（容器默认是 UTC）。 */
internal val CHINA_ZONE: ZoneId = ZoneId.of("Asia/Shanghai")

/** 休息日查询：节假日安排里有的按安排，没有的按周末判断。 */
@Service
class HolidayService(
    private val days: HolidayMapper,
    private val remote: HolidayRemote,
    private val transactions: TransactionTemplate,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** 表中没有安排的日期按周末判断，此时名称为空；数据库故障照常抛出，不能当成普通日期。 */
    fun query(date: LocalDate): HolidayDay {
        val text = date.toString()
        return days.findByDate(text)
            ?: HolidayDay(date = text, isOffDay = date.dayOfWeek in WEEKEND, name = "")
    }

    /** 以「先删后插」替换一整年。 */
    fun refreshYear(year: Int) {
        // 远程拉取放在事务外，免得一次最长 60 秒的 HTTP 调用白占着数据库连接
        val fetched = remote.fetchYear(year)
        // 还没发布就不动库：一年的安排公布之后不会变回没有，拉到空的只能是还没发布，或者数据源出了岔子（路径变了、全回 404），
        // 这时先删后插只会把已有的安排清掉
        if (fetched.isEmpty()) {
            log.info("节假日安排还没有发布 year={}", year)
            return
        }
        // 删和插在一个事务里：中途出错即回滚，不会留下「旧的没了、新的也没进来」的空年份
        transactions.executeWithoutResult {
            days.deleteYear(year)
            days.insertAll(fetched)
        }
        log.info("已刷新节假日数据 year={} count={}", year, fetched.size)
    }

    /** 刷新当年和次年。年份每次重新算，跨年后自然带上新的次年；两年互不依赖所以并行，任一失败即整体失败。 */
    fun refreshUpcomingYears() {
        val year = Year.now(CHINA_ZONE).value
        concurrently {
            listOf(year, year + 1).map { async { refreshYear(it) } }.awaitAll()
        }
    }

    /** 库里有没有今年的安排。 */
    fun hasCurrentYear(): Boolean = days.hasYear(Year.now(CHINA_ZONE).value)

    private companion object {
        val WEEKEND = setOf(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY)
    }
}
