package com.github.kzw200015.javaapi.common;

import org.springframework.http.HttpStatus;

/**
 * 通用 API 响应结构。
 */
public record ApiResponse<T>(int code, T data, String msg) {

    /**
     * 构造成功响应，使用 HTTP 200 语义。
     */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(HttpStatus.OK.value(), data, HttpStatus.OK.getReasonPhrase());
    }
}
