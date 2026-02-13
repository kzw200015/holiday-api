package com.github.kzw200015.myapi.common.mybatis;

import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.postgresql.util.PGobject;
import org.springframework.util.StringUtils;

import java.lang.reflect.Field;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class JsonbTypeHandler extends JacksonTypeHandler {

    public JsonbTypeHandler(Class<?> type) {
        super(type);
    }

    // 自3.5.6版本开始支持泛型,需要加上此构造.
    public JsonbTypeHandler(Class<?> type, Field field) {
        super(type, field);
    }

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, Object parameter, JdbcType jdbcType) throws SQLException {
        PGobject jsonbObject = new PGobject();
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

    /**
     * 将 JDBC 返回值适配为 JSON 字符串并反序列化为目标类型
     */
    private Object parseNullableJson(Object rawValue) {
        if (rawValue == null) {
            return null;
        }

        if (rawValue instanceof PGobject pgObject && pgObject.getType().equals("jsonb") && StringUtils.hasText(pgObject.getValue())) {
            return parse(pgObject.getValue());
        }

        return null;
    }
}
