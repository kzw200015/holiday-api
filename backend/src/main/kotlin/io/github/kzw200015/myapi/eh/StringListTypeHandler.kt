package io.github.kzw200015.myapi.eh

import org.apache.ibatis.type.BaseTypeHandler
import org.apache.ibatis.type.JdbcType
import org.apache.ibatis.type.MappedTypes
import org.springframework.stereotype.Component
import java.sql.CallableStatement
import java.sql.PreparedStatement
import java.sql.ResultSet

/**
 * PostgreSQL 的 text[] 列与 List<String> 互转。注册成 Bean，MyBatis starter 会自动收进去。
 *
 * 读取时按构造器参数的类型自动选中它；写入时 MyBatis 看的是参数的运行时类型，匹配不到 List 接口，
 * 所以 XML 里写入数组列的地方要显式带上 typeHandler。
 */
@Component
@MappedTypes(List::class)
class StringListTypeHandler : BaseTypeHandler<List<String>>() {
    override fun setNonNullParameter(ps: PreparedStatement, i: Int, parameter: List<String>, jdbcType: JdbcType?) {
        ps.setArray(i, ps.connection.createArrayOf("text", parameter.toTypedArray()))
    }

    override fun getNullableResult(rs: ResultSet, columnName: String) = toList(rs.getArray(columnName))

    override fun getNullableResult(rs: ResultSet, columnIndex: Int) = toList(rs.getArray(columnIndex))

    override fun getNullableResult(cs: CallableStatement, columnIndex: Int) = toList(cs.getArray(columnIndex))

    private fun toList(array: java.sql.Array?): List<String>? = (array?.array as Array<*>?)?.map { it as String }
}
