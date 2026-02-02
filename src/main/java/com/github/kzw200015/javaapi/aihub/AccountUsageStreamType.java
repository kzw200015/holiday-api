package com.github.kzw200015.javaapi.aihub;

/**
 * 用量记录请求类型。
 */
public enum AccountUsageStreamType {

    /**
     * 流式。
     */
    STREAM("stream"),

    /**
     * 非流式。
     */
    NON_STREAM("non_stream");

    private final String dbValue;

    AccountUsageStreamType(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }
}
