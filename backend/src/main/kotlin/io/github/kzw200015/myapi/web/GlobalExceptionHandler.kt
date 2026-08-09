package io.github.kzw200015.myapi.web

import io.github.kzw200015.myapi.apiresponse.ApiResponse
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import org.springframework.web.servlet.resource.NoResourceFoundException
import java.time.LocalDate

/**
 * 全局异常处理：把控制器抛出的异常统一转成 [ApiResponse] 结构。
 */
@RestControllerAdvice
class GlobalExceptionHandler {
    private val log = LoggerFactory.getLogger(javaClass)

    /** 请求参数转换失败。 */
    @ExceptionHandler(MethodArgumentTypeMismatchException::class)
    fun handleTypeMismatch(ex: MethodArgumentTypeMismatchException): ResponseEntity<ApiResponse> {
        val message = if (ex.requiredType == LocalDate::class.java) {
            "日期格式错误，应为 YYYY-MM-DD"
        } else {
            "参数 ${ex.name} 格式错误"
        }
        return ResponseEntity.badRequest().body(ApiResponse.badRequest(message))
    }

    /**
     * 无匹配路由：请求先由静态资源处理器兜底，找不到资源时抛出该异常。
     * 未匹配的 /api 开头路径返回统一 JSON 格式，其余路径保持无响应体的 404。
     */
    @ExceptionHandler(NoResourceFoundException::class)
    fun handleNoResourceFound(request: HttpServletRequest): ResponseEntity<ApiResponse> {
        // 去掉 servlet 上下文路径，应用部署在非根路径下时前缀判断才准确
        val path = request.requestURI.removePrefix(request.contextPath)
        return if (path == "/api" || path.startsWith("/api/")) {
            ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.notFound())
        } else {
            ResponseEntity.status(HttpStatus.NOT_FOUND).build()
        }
    }

    /** 其余未捕获异常统一转 500。 */
    @ExceptionHandler(Exception::class)
    fun handleUnexpected(ex: Exception, request: HttpServletRequest): ResponseEntity<ApiResponse> {
        // 末位的 Throwable 会被 slf4j 当作异常打出堆栈，不占用 {} 占位符
        log.error("未捕获异常: {}", request.requestURI, ex)
        return ResponseEntity.internalServerError()
            .body(ApiResponse.internalServerError(ex.message ?: "Internal Server Error"))
    }
}
