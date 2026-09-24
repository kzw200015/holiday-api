import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { SQL } from "bun"
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql"
import { migrate } from "drizzle-orm/bun-sql/migrator"

import type { Env } from "@/config"

export type Database = BunSQLDatabase & { $client: SQL }

/** 注入数据库用的令牌：`@Inject(DATABASE) database: Database`。 */
export const DATABASE = Symbol("DATABASE")

/* 迁移文件在 apps/server/drizzle，本文件往上两级 */
const MIGRATIONS = `${import.meta.dirname}/../../drizzle`

/** 连接池（Bun 自带的 PostgreSQL 客户端）与 drizzle 实例。创建时先把没执行过的迁移跑完，之后各模块才拿得到它。 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService<Env, true>) => {
        const client = new SQL(configService.get("DATABASE_URL", { infer: true }))
        const db = drizzle({ client })
        try {
          await migrate(db, { migrationsFolder: MIGRATIONS })
        } catch (error) {
          await client.close()
          throw error
        }
        return db
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onApplicationShutdown() {
    await this.database.$client.close()
  }
}
