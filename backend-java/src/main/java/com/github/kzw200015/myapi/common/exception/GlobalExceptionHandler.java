package com.github.kzw200015.myapi.common.exception;

import com.github.kzw200015.myapi.codex.exception.AccountNotFoundException;
import com.github.kzw200015.myapi.codex.exception.NoAvailableAccountException;
import com.github.kzw200015.myapi.codex.exception.UpstreamRequestFailedException;
import com.github.kzw200015.myapi.common.model.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 全局异常处理：统一将异常转换为 {code, data, msg}。
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(AccountNotFoundException.class)
    public ResponseEntity<ApiResponse<Object>> handleAccountNotFound(AccountNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.notFound());
    }

    @ExceptionHandler(NoAvailableAccountException.class)
    public ResponseEntity<ApiResponse<Object>> handleNoAvailableAccount(NoAvailableAccountException ex) {
        return build(HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage());
    }

    @ExceptionHandler(UpstreamRequestFailedException.class)
    public ResponseEntity<ApiResponse<Object>> handleUpstreamRequestFailed(UpstreamRequestFailedException ex) {
        return build(HttpStatus.BAD_GATEWAY, ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Object>> handleException(Exception ex) {
        log.error("全局异常处理：{}", ex.getMessage(), ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
    }

    private ResponseEntity<ApiResponse<Object>> build(HttpStatus status, String msg) {
        return ResponseEntity.status(status).body(ApiResponse.of(status.value(), null, msg));
    }
}
