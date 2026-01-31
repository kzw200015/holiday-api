package com.github.kzw200015.javaapi.common.mybatis;

import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import java.lang.reflect.Field;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.JdbcType;
import org.postgresql.util.PGobject;

/**
 * PostgreSQL jsonb 字段 TypeHandler。
 */
public class JsonbTypeHandler extends JacksonTypeHandler {

    public JsonbTypeHandler(Class<?> type) {
        super(type);
    }

    // 自 3.5.6 版本开始支持泛型，需要加上此构造。
    public JsonbTypeHandler(Class<?> type, Field field) {
        super(type, field);
    }

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, Object parameter, JdbcType jdbcType) throws SQLException {
        final PGobject jsonbObject = new PGobject();
        jsonbObject.setType("jsonb");
        jsonbObject.setValue(toJson(parameter));
        ps.setObject(i, jsonbObject);
    }

    @Override
    public Object getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parseNullableJson(rs.getObject(columnName));
    }

    @Override
    public Object getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parseNullableJson(rs.getObject(columnIndex));
    }

    @Override
    public Object getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parseNullableJson(cs.getObject(columnIndex));
    }

    private Object parseNullableJson(Object rawValue) {
        if (rawValue == null) {
            return null;
        }

        if (rawValue instanceof PGobject pgObject && pgObject.getType().equals("jsonb")) {
            return parse(pgObject.getValue());
        }

        return null;
    }
}
