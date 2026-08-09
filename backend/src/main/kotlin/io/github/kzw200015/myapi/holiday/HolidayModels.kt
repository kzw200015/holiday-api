package io.github.kzw200015.myapi.holiday

import com.baomidou.mybatisplus.annotation.TableField
import com.baomidou.mybatisplus.annotation.TableName
import com.fasterxml.jackson.annotation.JsonProperty

/**
 * 远程节假日 JSON 中的单日数据，同时用作 holiday_days 表的行结构。
 *
 * Kotlin 的 `isOffDay` 属性生成的读写方法是 `isOffDay()` / `setOffDay()`，
 * Jackson 与 MyBatis 据此推断出的名称都不是想要的，因此列名与 JSON 名都显式标注。
 * 本类只被反序列化和读写数据库，不作为响应体输出，所以只标注构造参数而不标注 getter。
 * 所有参数带默认值，Kotlin 会额外生成无参构造，供 MyBatis 反射建对象。
 */
@TableName("holiday_days")
data class HolidayDay(
    var name: String = "",
    var date: String = "",
    @param:JsonProperty("isOffDay")
    @field:TableField("is_off_day")
    var isOffDay: Boolean = false,
)

/**
 * 远程数据源单个年份的响应结构。
 */
data class HolidayYearResponse(
    val days: List<HolidayDay>? = null,
)

/**
 * 节假日查询接口返回的数据。
 * [name] 为空表示该日期在节假日表中无记录（普通工作日或普通周末）。
 */
data class HolidayQueryResult(
    val date: String,
    @get:JsonProperty("isOffDay")
    val isOffDay: Boolean,
    val name: String,
)
