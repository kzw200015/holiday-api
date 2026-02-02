package com.github.kzw200015.javaapi.common;

import java.util.List;

/**
 * 通用分页响应结构。
 */
public record PageResult<T>(int current, int size, long total, List<T> records) {
}
