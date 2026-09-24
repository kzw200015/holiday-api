import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { JwtService } from "@nestjs/jwt"
import { z } from "zod"

import { IS_PUBLIC, type AuthenticatedRequest } from "@/auth/auth.decorators"
import { numeric } from "@/numeric"

/** 令牌载荷里的 sub：本站账号 id 的十进制写法。 */
const subject = numeric(z.int().positive(), "令牌载荷不合法")

/**
 * 鉴权边界：接口默认要求登录，标了 @Public() 的放行。公开接口上带着有效令牌时照样认出登录者（「我是谁」要用）。
 *
 * 身份走 Authorization 头而不是 Cookie，所以也没有 CSRF 防护：跨站伪造之所以成立，是因为 Cookie
 * 由浏览器自动带上；令牌要前端主动取出来塞进头里，跨站页面读不到也就冒名不了。
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const userId = await this.identify(request.headers.authorization)
    if (userId !== null) {
      request.userId = userId
      return true
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true
    }
    throw new UnauthorizedException("请先登录")
  }

  /** 没带令牌、签名不对、载荷坏了、已过期，一律当作没登录，而不是报错。 */
  private async identify(authorization: string | undefined): Promise<number | null> {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : ""
    if (!token) {
      return null
    }
    try {
      const { sub } = await this.jwtService.verifyAsync<{ sub?: unknown }>(token)
      const parsed = subject.safeParse(sub)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
}
