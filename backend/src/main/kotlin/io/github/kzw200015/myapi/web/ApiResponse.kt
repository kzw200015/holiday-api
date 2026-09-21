package io.github.kzw200015.myapi.web

/**
 * 所有 JSON 接口的统一响应体，与前端 shared/api/httpClient.ts 的 ApiResponse 对齐。
 *
 * 唯一的例外是两个图片接口，它们直接回二进制流。
 */
data class ApiResponse<T>(val code: Int, val data: T, val msg: String)

fun <T> ok(data: T): ApiResponse<T> = ApiResponse(200, data, "OK")

/** 只回成败的接口，data 就是 null。 */
fun ok(): ApiResponse<Nothing?> = ok(null)
