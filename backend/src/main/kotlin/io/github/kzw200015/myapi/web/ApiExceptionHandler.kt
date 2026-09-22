package io.github.kzw200015.myapi.web

import io.github.kzw200015.myapi.AppException
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.HttpStatusCode
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.context.request.WebRequest
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler
import org.springframework.web.util.DisconnectedClientHelper

/**
 * 把失败翻译成统一响应体：「什么错回什么状态码」只在这里实现，业务代码只管抛。
 *
 * 可预期的失败（配额用尽、Cookie 失效、签名过期）各有各的状态码，一律转成 500 的话，
 * 「额度没了」和「服务器崩了」在前端就分不出来。
 */
@RestControllerAdvice
class ApiExceptionHandler : ResponseEntityExceptionHandler() {
    private val log = LoggerFactory.getLogger(javaClass)

    @ExceptionHandler
    fun handle(e: AppException, request: HttpServletRequest): ResponseEntity<ApiResponse<Nothing?>> {
        val status = when (e) {
            is AppException.InvalidArgument -> HttpStatus.BAD_REQUEST
            is AppException.Unauthenticated -> HttpStatus.UNAUTHORIZED
            is AppException.PermissionDenied -> HttpStatus.FORBIDDEN
            is AppException.NotFound -> HttpStatus.NOT_FOUND
            is AppException.ResourceExhausted -> HttpStatus.TOO_MANY_REQUESTS
            is AppException.UpstreamFailure -> HttpStatus.BAD_GATEWAY
        }
        // 4xx 是调用方的问题，记 info 就够；5xx 说明上游或本站出了状况，升到 warn
        val format = "请求失败 {} {} {} {}"
        if (status.is5xxServerError) {
            log.warn(format, request.method, request.requestURI, status.value(), e.message, e.cause)
        } else {
            log.info(format, request.method, request.requestURI, status.value(), e.message)
        }
        return failure(status, e.message.orEmpty())
    }

    @ExceptionHandler
    fun handle(e: Exception, request: HttpServletRequest): ResponseEntity<ApiResponse<Nothing?>>? {
        // 客户端已经走了（阅读器里快速翻页时浏览器会成批中止图片请求）：既没人收，也不该按故障记
        if (DisconnectedClientHelper.isClientDisconnectedException(e)) {
            log.debug("客户端已断开，放弃响应 {} {}", request.method, request.requestURI)
            return null
        }
        // 没预料到的错误原文只进日志，不回给客户端：里面可能带着表名、文件路径这类不该外泄的细节
        log.error("未捕获异常 {} {}", request.method, request.requestURI, e)
        return failure(HttpStatus.INTERNAL_SERVER_ERROR, "服务器内部错误")
    }

    /** Spring MVC 自己抛的那些（路径不存在、请求体解不开、参数类型不对）也回统一结构，前端拦截器才取得到 msg。 */
    override fun handleExceptionInternal(
        ex: Exception,
        body: Any?,
        headers: HttpHeaders,
        statusCode: HttpStatusCode,
        request: WebRequest,
    ): ResponseEntity<Any>? {
        val msg = when {
            statusCode.value() == 404 -> "Not Found"
            statusCode.value() == 405 -> "Method Not Allowed"
            ex is HttpMessageNotReadableException -> "请求体格式错误"
            statusCode.is4xxClientError -> "请求参数格式错误"
            else -> "服务器内部错误"
        }
        // 5xx 是本站的问题（响应体写不出去、路径变量没配上），回给客户端的只有一句话，原文得进日志
        if (statusCode.is5xxServerError) {
            log.error("请求失败 {} {}", statusCode.value(), request.getDescription(false), ex)
        }
        return super.handleExceptionInternal(ex, ApiResponse(statusCode.value(), null, msg), headers, statusCode, request)
    }

    private fun failure(status: HttpStatus, msg: String) =
        ResponseEntity.status(status).body(ApiResponse(status.value(), null, msg))
}
