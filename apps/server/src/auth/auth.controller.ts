import { credentialsSchema, type AuthOptions, type Credentials, type CurrentUser as User } from "@myapi/shared"
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common"

import { CurrentUser, Public } from "@/auth/auth.decorators.js"
import { AuthService } from "@/auth/auth.service.js"

/** 登录页要用的这几条都不要求登录。e 站的绑定状态是 eh 的事，不在这里返回。 */
@Public()
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 登录页据此决定给不给注册入口，否则关了注册的站点上，用户要把表单填完提交了才知道注册不了。 */
  @Get("options")
  options(): AuthOptions {
    return { allowRegistration: this.auth.registrationOpen }
  }

  @Post("register")
  register(@Body({ schema: credentialsSchema }) body: Credentials) {
    return this.auth.register(body)
  }

  /* 登录不创建资源，回 200 而不是 POST 默认的 201 */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body({ schema: credentialsSchema }) body: Credentials) {
    return this.auth.login(body)
  }

  /** 当前登录者。未登录或账号已被删都是 200 的 null：前端拿 401 会跳登录页，而登录页自己也要问「我是谁」。 */
  @Get("me")
  async me(@CurrentUser() userId: number | null): Promise<User | null> {
    return userId === null ? null : this.auth.find(userId)
  }
}
