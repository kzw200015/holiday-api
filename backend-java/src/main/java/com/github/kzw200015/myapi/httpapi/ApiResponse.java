package com.github.kzw200015.myapi.httpapi;

import org.springframework.http.HttpStatus;

/**
 * 统一接口返回结构：{ code, data, msg }。
 */
public record ApiResponse<T>(int code, T data, String msg) {
    public static <T> ApiResponse<T> of(int code, T data, String msg) {
        String resolvedMsg = msg;
        if (resolvedMsg == null || resolvedMsg.isBlank()) {
            resolvedMsg = HttpStatus.valueOf(code).getReasonPhrase();
        }
        return new ApiResponse<>(code, data, resolvedMsg);
    }

    public static <T> ApiResponse<T> ok(T data) {
        return of(HttpStatus.OK.value(), data, "");
    }

    public static ApiResponse<Object> badRequest(String msg) {
        return of(HttpStatus.BAD_REQUEST.value(), null, msg);
    }

    public static ApiResponse<Object> notFound() {
        return of(HttpStatus.NOT_FOUND.value(), null, "");
    }

    public static ApiResponse<Object> internalServerError(String msg) {
        return of(HttpStatus.INTERNAL_SERVER_ERROR.value(), null, msg);
    }
}
