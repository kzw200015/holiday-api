package io.github.kzw200015.myapi.auth

import io.github.kzw200015.myapi.AppException
import io.github.kzw200015.myapi.signing.SigningKeys
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.MethodParameter
import org.springframework.http.HttpHeaders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.context.request.RequestAttributes
import org.springframework.web.method.HandlerMethod
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

/** 解出来的登录者放在请求属性上，由 [CurrentUserResolver] 交给控制器。 */
private const val USER_ID_ATTRIBUTE = "io.github.kzw200015.myapi.auth.userId"

/**
 * 鉴权边界：/api 下的接口默认要求登录，标了 [Public] 的放行。
 *
 * 身份走 Authorization 头而不是 Cookie，所以也没有 CSRF 防护：跨站伪造之所以成立，是因为 Cookie
 * 由浏览器自动带上；令牌要前端主动取出来塞进头里，跨站页面读不到也就冒名不了。
 */
class AuthInterceptor(private val tokens: JwtTokens) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (handler !is HandlerMethod) {
            return true
        }
        val userId = tokens.read(request.getHeader(HttpHeaders.AUTHORIZATION))
        if (userId != null) {
            request.setAttribute(USER_ID_ATTRIBUTE, userId)
        } else if (!handler.isPublic()) {
            throw AppException.Unauthenticated("请先登录")
        }
        return true
    }

    private fun HandlerMethod.isPublic() =
        hasMethodAnnotation(Public::class.java) || beanType.isAnnotationPresent(Public::class.java)
}

class CurrentUserResolver : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter) = parameter.hasParameterAnnotation(CurrentUser::class.java)

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): Any? {
        val userId = webRequest.getAttribute(USER_ID_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST)
        // 要求登录的接口到这里一定有登录者；公开接口上的 @CurrentUser 参数必须能接住 null
        check(userId != null || parameter.isOptional) {
            "${parameter.method} 标了 @Public，它的 @CurrentUser 参数要声明成可空"
        }
        return userId
    }
}

@Configuration
class AuthConfiguration(private val keys: SigningKeys, private val properties: AuthProperties) : WebMvcConfigurer {
    @Bean
    fun jwtTokens() = JwtTokens(keys.token, properties.tokenTtl)

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(AuthInterceptor(jwtTokens())).addPathPatterns("/api/**")
    }

    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(CurrentUserResolver())
    }
}
