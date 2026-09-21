package io.github.kzw200015.myapi.auth

import io.github.kzw200015.myapi.AppException
import org.slf4j.LoggerFactory
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service

/** 本站账号：注册与登录。 */
@Service
class AuthService(
    private val users: UserMapper,
    private val passwords: PasswordHasher,
    private val properties: AuthProperties,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** 是否开放注册。它是部署时的配置，前端打包时无从知道，只能来问。 */
    val registrationOpen: Boolean get() = properties.allowRegistration

    fun register(username: String, password: String): User {
        if (!registrationOpen) {
            throw AppException.InvalidArgument("本站已关闭注册")
        }
        val user = try {
            users.insert(username, passwords.hash(password))
        } catch (_: DuplicateKeyException) {
            throw AppException.InvalidArgument("用户名已被占用")
        }
        log.info("已注册新用户 userId={} username={}", user.id, user.username)
        return user
    }

    /** 用户不存在与密码不对回同一句话，耗时也一样（见 PasswordHasher.matches），不泄露哪些用户名存在。 */
    fun login(username: String, password: String): User {
        val user = users.findByUsername(username)
        if (!passwords.matches(password, user?.passwordHash) || user == null) {
            throw AppException.InvalidArgument("用户名或密码错误")
        }
        return user
    }

    /** 账号已被删就按未登录处理，所以找不到是 null 而不是错误。 */
    fun find(id: Long): User? = users.findById(id)
}
