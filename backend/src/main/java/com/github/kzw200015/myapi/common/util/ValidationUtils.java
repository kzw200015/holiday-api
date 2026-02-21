package com.github.kzw200015.myapi.common.util;

/**
 * 通用参数校验工具。
 */
public final class ValidationUtils {
    private ValidationUtils() {}

    public static String requireNonBlank(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return value;
    }
}
