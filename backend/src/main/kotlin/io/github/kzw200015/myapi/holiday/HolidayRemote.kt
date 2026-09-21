package io.github.kzw200015.myapi.holiday

import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.client.body
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.readValue
import java.time.LocalDate
import java.time.format.DateTimeParseException

/** 从 holiday-cn 仓库拉取节假日安排。由 HolidayConfiguration 组装。 */
class HolidayRemote(private val http: RestClient, private val json: JsonMapper) {
    /** 拉取一整年，顺带校验每条的日期格式，免得脏数据入库。次年安排还没发布时是空列表。 */
    fun fetchYear(year: Int): List<HolidayDay> {
        // 数据源把 .json 文件按 text/plain 返回，所以先取成字符串再按 JSON 解
        val text = try {
            http.get().uri("/{year}.json", year).retrieve().body<String>().orEmpty()
        } catch (e: RestClientException) {
            throw IllegalStateException("拉取 $year 年节假日数据失败", e)
        }
        val days = json.readValue<Payload>(text).days
        for (day in days) {
            try {
                LocalDate.parse(day.date)
            } catch (e: DateTimeParseException) {
                throw IllegalStateException("$year 年节假日数据里有不合法的日期 ${day.date}", e)
            }
        }
        return days
    }

    private data class Payload(val days: List<HolidayDay>)
}
