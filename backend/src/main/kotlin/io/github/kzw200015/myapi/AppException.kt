package io.github.kzw200015.myapi

/**
 * 可预期的失败。message 可以原样展示给用户，cause 只用于诊断、只进日志。
 *
 * 种类到 HTTP 状态码的映射只在 web.ApiExceptionHandler 一处。写成 sealed，新增一个种类时那里的 when
 * 就编不过，不会出现「漏登记、悄悄变成 500」这种事。
 */
sealed class AppException(message: String, cause: Throwable? = null) : RuntimeException(message, cause) {
    class InvalidArgument(message: String) : AppException(message)

    class Unauthenticated(message: String) : AppException(message)

    /** 访问许可失效，例如签名地址过期。这是本站自己的判断，不能混进上游故障，否则会淹掉「e 站真的挂了」的信号。 */
    class PermissionDenied(message: String) : AppException(message)

    class NotFound(message: String) : AppException(message)

    /** 配额用尽、出口 IP 被临时封禁这类「过会儿再试」的失败，和「服务器崩了」要能在前端分得出来。 */
    class ResourceExhausted(message: String) : AppException(message)

    /** 上游没连上，或者返回了意料之外的东西（通常是版面改了）。 */
    open class UpstreamFailure(message: String, cause: Throwable? = null) : AppException(message, cause)
}
