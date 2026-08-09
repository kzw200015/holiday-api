package io.github.kzw200015.myapi.apiresponse

/**
 * 所有接口的统一响应体，与前端 src/types/apiResponse.ts 保持一致。
 *
 * 字段顺序即 JSON 序列化顺序：code、data、msg。
 */
data class ApiResponse(
    val code: Int,
    val data: Any?,
    val msg: String,
) {
    companion object {
        /** 构造成功响应。 */
        fun ok(data: Any?) = ApiResponse(code = 200, data = data, msg = "OK")

        /** 构造参数错误响应。 */
        fun badRequest(msg: String) = ApiResponse(code = 400, data = null, msg = msg)

        /** 构造资源不存在响应。 */
        fun notFound() = ApiResponse(code = 404, data = null, msg = "Not Found")

        /** 构造服务端错误响应。 */
        fun internalServerError(msg: String) = ApiResponse(code = 500, data = null, msg = msg)
    }
}
