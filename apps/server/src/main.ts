import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"

import { AppModule } from "@/app.module"
import type { Env } from "@/config"

const app = await NestFactory.create(AppModule)
/* 容器停止时收到 SIGTERM，要先关掉连接池再退出 */
app.enableShutdownHooks()
await app.listen(app.get(ConfigService<Env, true>).get("PORT", { infer: true }))
