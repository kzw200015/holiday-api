import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common"
import type { Request } from "express"

export const IS_PUBLIC = "isPublic"

/**
 * 不要求登录的接口，标在控制器类或方法上。
 *
 * /api 下其余接口一律要求登录（见 AuthGuard）：新接口默认是要登录的，漏标的代价是多一次 401，
 * 而不是把接口裸露出去。公开接口的清单由接口测试锁住。
 */
export const Public = () => SetMetadata(IS_PUBLIC, true)

/** AuthGuard 认出来的登录者挂在请求上的位置。 */
export interface AuthenticatedRequest extends Request {
  userId?: number
}

/**
 * 当前登录的本站账号 id。身份只认登录令牌，不认请求里的任何 userId。
 *
 * 要求登录的接口上它一定有值；公开接口上没登录或令牌无效时是 null，参数要声明成 `number | null`。
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<AuthenticatedRequest>().userId ?? null,
)
