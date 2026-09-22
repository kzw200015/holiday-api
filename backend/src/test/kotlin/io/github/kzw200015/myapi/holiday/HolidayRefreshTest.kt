package io.github.kzw200015.myapi.holiday

import io.github.kzw200015.myapi.eh.FakeResponse
import io.github.kzw200015.myapi.eh.FakeUpstream
import io.github.kzw200015.myapi.eh.testJson
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.client.RestClient
import java.io.IOException
import java.time.Duration
import java.time.Year
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class HolidayRefreshTest {
    private val thisYear = Year.now(CHINA_ZONE).value

    /** 库换成一张按年份分组的内存表。 */
    private class InMemoryHolidays : HolidayMapper {
        val years = mutableMapOf<Int, List<HolidayDay>>()

        override fun findByDate(date: String) = years[date.take(4).toInt()]?.firstOrNull { it.date == date }

        override fun hasYear(year: Int) = years[year].orEmpty().isNotEmpty()

        override fun deleteYear(year: Int) {
            years.remove(year)
        }

        override fun insertAll(days: List<HolidayDay>) {
            days.groupBy { it.date.take(4).toInt() }.forEach { (year, list) -> years[year] = list }
        }
    }

    private val noTransactions = TransactionTemplate(object : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        override fun commit(status: TransactionStatus) = Unit

        override fun rollback(status: TransactionStatus) = Unit
    })

    private fun refresh(days: InMemoryHolidays, respond: (year: Int) -> FakeResponse): HolidayRefresh {
        val upstream = FakeUpstream { request -> respond(request.uri.path.removePrefix("/").removeSuffix(".json").toInt()) }
        val remote = HolidayRemote(RestClient.builder().requestFactory(upstream).build(), testJson)
        return HolidayRefresh(HolidayService(days, remote, noTransactions), HolidayProperties(Duration.ofHours(24)))
    }

    private fun day(year: Int) = HolidayDay("$year-01-01", true, "元旦")

    private fun json(vararg days: HolidayDay) = FakeResponse(
        """{"days":[${days.joinToString(",") { """{"name":"${it.name}","date":"${it.date}","isOffDay":${it.isOffDay}}""" }}]}""",
        contentType = "text/plain; charset=utf-8",
    )

    @Test
    fun `次年的文件还没建出来（404）或安排还没公布，都不算失败，也不动库里已有的`() {
        val days = InMemoryHolidays().apply { years[thisYear + 1] = listOf(day(thisYear + 1)) }
        refresh(days) { year -> if (year == thisYear) json(day(thisYear)) else FakeResponse("", 404) }.afterPropertiesSet()
        assertEquals(listOf(day(thisYear)), days.years[thisYear])
        assertEquals(listOf(day(thisYear + 1)), days.years[thisYear + 1])

        refresh(days) { year -> if (year == thisYear) json(day(thisYear)) else json() }.afterPropertiesSet()
        assertEquals(listOf(day(thisYear + 1)), days.years[thisYear + 1])
    }

    @Test
    fun `数据源连不上时，库里有今年的安排就照常启动，没有才拒绝启动`() {
        val unreachable: (Int) -> FakeResponse = { throw IOException("Connection reset") }

        val ready = InMemoryHolidays().apply { years[thisYear] = listOf(day(thisYear)) }
        refresh(ready, unreachable).afterPropertiesSet()

        assertFailsWith<IllegalStateException> { refresh(InMemoryHolidays(), unreachable).afterPropertiesSet() }
    }
}
