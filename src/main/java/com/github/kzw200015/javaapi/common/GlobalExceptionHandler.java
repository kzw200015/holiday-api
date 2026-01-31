package com.github.kzw200015.javaapi.common;

import java.time.format.DateTimeParseException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * 全局异常处理器。
 *
 * <p>返回体统一为 {@link ApiResponse}，并且 HTTP 状态码与错误类型对应。
 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    /**
     * 请求参数或绑定错误，返回 400。
     */
    @ExceptionHandler({
        IllegalArgumentException.class,
        DateTimeParseException.class,
        MissingServletRequestParameterException.class,
        MethodArgumentTypeMismatchException.class,
        BindException.class,
        MethodArgumentNotValidException.class,
        HttpMessageNotReadableException.class
    })
    public ResponseEntity<ApiResponse<Void>> handleBadRequest(Exception ex) {
        final String msg = resolveBadRequestMessage(ex);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiResponse<>(HttpStatus.BAD_REQUEST.value(), null, msg));
    }

    /**
     * Spring Web 内置的带状态码异常，按其状态码返回。
     */
    @ExceptionHandler(ErrorResponseException.class)
    public ResponseEntity<ApiResponse<Void>> handleErrorResponseException(ErrorResponseException ex) {
        final HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        final String msg = ex.getMessage();
        return ResponseEntity.status(status).body(new ApiResponse<>(status.value(), null, msg));
    }

    /**
     * 未被显式处理的异常，返回 500。
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleInternalServerError(Exception ex) {
        log.error("未处理异常", ex);
        final HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        return ResponseEntity.status(status).body(new ApiResponse<>(status.value(), null, "服务器内部错误"));
    }

    private static String resolveBadRequestMessage(Exception ex) {
        if (ex instanceof DateTimeParseException) {
            return "日期格式错误，期望 yyyy-MM-dd";
        }
        if (ex instanceof HttpMessageNotReadableException) {
            return "请求体解析失败";
        }
        if (ex instanceof MethodArgumentNotValidException || ex instanceof BindException) {
            return "参数校验失败";
        }
        return "请求参数错误";
    }
}
