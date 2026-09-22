package io.github.kzw200015.myapi.holiday

import org.apache.ibatis.annotations.Mapper

/**
 * 节假日安排里的一天：远程 JSON 里 days 数组的元素、holiday_days 表里的一行，也是 detail 接口的响应体。
 *
 * 日期在库列、接口出入参和远程 JSON 里统一是 YYYY-MM-DD 字符串。
 */
data class HolidayDay(
    val date: String,
    val isOffDay: Boolean,
    /** 为空表示该日期不在节假日安排里，即普通工作日或普通周末。 */
    val name: String,
)

/** SQL 在同包路径下的 HolidayMapper.xml。 */
@Mapper
interface HolidayMapper {
    fun findByDate(date: String): HolidayDay?

    fun hasYear(year: Int): Boolean

    fun deleteYear(year: Int)

    /** 不接受空列表：拼出来的 VALUES 后面没有行，是句不合法的 SQL。 */
    fun insertAll(days: List<HolidayDay>)
}
