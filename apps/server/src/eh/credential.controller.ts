import { ehCookieSchema, type CredentialStatus, type EhCredential } from "@myapi/shared"
import { Body, Controller, Delete, Get, Post } from "@nestjs/common"

import { CurrentUser } from "@/auth/auth.decorators.js"
import { CredentialService } from "@/eh/credential.service.js"

/** e 站凭据的绑定状态、绑定与解绑。都由服务端给出结果状态，前端直接用。 */
@Controller("eh/credential")
export class CredentialController {
  constructor(private readonly credentials: CredentialService) {}

  @Get()
  status(@CurrentUser() userId: number): Promise<CredentialStatus> {
    return this.credentials.status(userId)
  }

  @Post()
  bind(
    @CurrentUser() userId: number,
    @Body({ schema: ehCookieSchema }) cookie: EhCredential,
  ): Promise<CredentialStatus> {
    return this.credentials.bind(userId, cookie)
  }

  @Delete()
  unbind(@CurrentUser() userId: number): Promise<CredentialStatus> {
    return this.credentials.unbind(userId)
  }
}
