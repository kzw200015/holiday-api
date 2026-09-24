import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { APP_GUARD } from "@nestjs/core"
import { JwtModule } from "@nestjs/jwt"

import { AuthController } from "@/auth/auth.controller.js"
import { AuthGuard } from "@/auth/auth.guard.js"
import { AuthService } from "@/auth/auth.service.js"
import type { Env } from "@/config.js"
import { SigningKeys } from "@/signing/signing.module.js"

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [SigningKeys, ConfigService],
      useFactory: (signingKeys: SigningKeys, configService: ConfigService<Env, true>) => ({
        secret: signingKeys.token,
        /* 只认 HS256：照令牌头里自称的 alg 去验，等于让攻击者自己挑用哪把锁（alg: none） */
        signOptions: {
          algorithm: "HS256",
          expiresIn: Math.floor(configService.get("TOKEN_TTL", { infer: true }) / 1000),
        },
        verifyOptions: { algorithms: ["HS256"] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
