package io.github.kzw200015.myapi.holiday

import com.baomidou.mybatisplus.annotation.TableName

/**
 * 远程节假日 JSON 中的单日数据，同时用作 holiday_days 表的行结构。
 *
 * `isOffDay` 不需要额外标注 JSON 名与列名：jackson-module-kotlin 会原样保留 `is` 前缀，
 * 不套用 Java Bean 去前缀规则；MyBatis-Plus 按字段名（而非 `setOffDay` 推断出的名字）
 * 生成 `is_off_day` 列并直接反射读写字段。改动前先确认这两个前提仍成立。
 * 所有参数带默认值，Kotlin 会额外生成无参构造，供 MyBatis 反射建对象。
 */
@TableName("holiday_days")
data class HolidayDay(
    var name: String = "",
    var date: String = "",
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
    val isOffDay: Boolean,
    val name: String,
)
