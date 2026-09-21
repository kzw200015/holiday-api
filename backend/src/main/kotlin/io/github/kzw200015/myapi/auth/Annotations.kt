package io.github.kzw200015.myapi.auth

/**
 * 不要求登录的接口，标在控制器类或方法上。
 *
 * /api 下其余接口一律要求登录（见 AuthInterceptor）：新接口默认是要登录的，漏标的代价是多一次 401，
 * 而不是把接口裸露出去。公开接口的清单由 ApiTest 锁住。
 */
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Public

/**
 * 把当前登录的本站账号 id 注入控制器参数。
 *
 * 身份只认登录令牌，不认请求里的任何 userId。参数声明成可空时是「软读取」：没登录或令牌无效拿到 null，
 * 不回 401——只有标了 [Public] 的接口才会遇到这种情况。
 */
@Target(AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
annotation class CurrentUser
