import { fileURLToPath } from "node:url"
import { BadRequestException, Module, StandardSchemaValidationPipe } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { APP_PIPE } from "@nestjs/core"
import { ScheduleModule } from "@nestjs/schedule"
import { ServeStaticModule } from "@nestjs/serve-static"

import { AuthModule } from "./auth/auth.module.js"
import { validateEnv } from "./config.js"
import { DatabaseModule } from "./database/database.module.js"
import { EhModule } from "./eh/eh.module.js"
import { HolidayModule } from "./holiday/holiday.module.js"
import { OutboundModule } from "./outbound/outbound.module.js"
import { SigningModule } from "./signing/signing.module.js"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    /*
     * 镜像里前端产物放在 apps/server/client。前端用哈希路由，只有根路径需要回 index.html：
     * 默认的 renderPath 会把所有没匹配上的 GET 都回成 index.html，/api 下写错的路径也就拿不到 404 了。
     */
    ServeStaticModule.forRoot({ rootPath: fileURLToPath(new URL("../client", import.meta.url)), renderPath: "/" }),
    DatabaseModule,
    OutboundModule,
    SigningModule,
    AuthModule,
    EhModule,
    HolidayModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      /*
       * 控制器参数上挂共享的 zod schema，由这个管道统一校验。默认的报错会在每条文案前加上字段路径（「entries.0: …」），
       * 而中文文案本身已经说清了是哪一项，前端直接展示，所以只留文案。
       */
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: (issues) => new BadRequestException([...new Set(issues.map((issue) => issue.message))]),
      }),
    },
  ],
})
export class AppModule {}
