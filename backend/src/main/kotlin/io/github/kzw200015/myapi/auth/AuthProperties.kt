package io.github.kzw200015.myapi.auth

import java.time.Duration
import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties("myapi.auth")
data class AuthProperties(
    /**
     * 是否开放注册，默认关闭。
     *
     * 公网部署时任何人注册即可借这台机器代理 e 站流量，被封的是本机出口 IP；而且 e 站凭据是明文入库的，
     * 账号越少、越都是自己人，这个取舍才成立。建第一个账号的办法：把它打开、启动、注册完再关回去重启。
     */
    val allowRegistration: Boolean = false,
    /** 登录令牌有效期。令牌无状态，服务端不存已签发的令牌，所以没法提前作废。 */
    val tokenTtl: Duration = Duration.ofDays(30),
)
