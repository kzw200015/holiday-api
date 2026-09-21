package io.github.kzw200015.myapi.auth

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.web.ok
import org.springframework.web.bind.annotation.*

/**
 * 登录页要用的这几条都不要求登录。
 *
 * 这里不返回 e 站的绑定状态：那是 eh 的事，放在 GET /api/eh/credential，免得两块业务的类型互相缠住。
 */
@Public
@RestController
@RequestMapping("/api/auth")
class AuthController(private val auth: AuthService, private val tokens: JwtTokens) {
    /** 登录页据此决定给不给注册入口，否则关了注册的站点上，用户要把表单填完提交了才知道注册不了。 */
    @GetMapping("/options")
    fun options() = ok(AuthOptions(auth.registrationOpen))

    /** 注册成功即登录。用户名被占用或站点关闭注册时回 400。 */
    @PostMapping("/register")
    fun register(@RequestBody body: LoginForm) = ok(authenticate(body, auth::register))

    @PostMapping("/login")
    fun login(@RequestBody body: LoginForm) = ok(authenticate(body, auth::login))

    /** 当前登录者，未登录或账号已被删都是 data 为 null 的 200：前端拿 401 会跳登录页，而登录页自己也要问「我是谁」。 */
    @GetMapping("/me")
    fun me(@CurrentUser userId: Long?) = ok(userId?.let(auth::find)?.let(::CurrentUserView))

    private fun authenticate(body: LoginForm, verify: (String, String) -> User): Authenticated {
        body.validate()
        val user = verify(body.username, body.password)
        return Authenticated(tokens.issue(user.id), CurrentUserView(user))
    }
}

data class AuthOptions(val allowRegistration: Boolean)

/** 登录与注册的响应：令牌交给前端自己保管。 */
data class Authenticated(val token: String, val user: CurrentUserView)

/** 能给前端看的两列。 */
data class CurrentUserView(val id: Long, val username: String) {
    constructor(user: User) : this(user.id, user.username)
}

data class LoginForm(val username: String = "", val password: String = "") {
    /**
     * 用户名限制成一眼能认的字符集，因为它会出现在 URL 和日志里；密码只卡长度、不强制复杂度——
     * 强制复杂度反而会逼出「Passw0rd!」这种可预测的密码。长度按字符数而不是字节数：3 个汉字不该算够 8 位。
     */
    fun validate() {
        if (!USERNAME.matches(username)) {
            throw AppException.InvalidArgument("用户名只能是 3 到 32 位的字母、数字、下划线或连字符")
        }
        val length = password.codePointCount(0, password.length)
        when {
            length < 8 -> throw AppException.InvalidArgument("密码至少 8 位")
            length > 128 -> throw AppException.InvalidArgument("密码最长 128 位")
        }
    }

    private companion object {
        val USERNAME = Regex("^[0-9A-Za-z_-]{3,32}$")
    }
}
