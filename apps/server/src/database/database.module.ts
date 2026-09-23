import { fileURLToPath } from "node:url"
import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

import type { Env } from "../config.js"
import * as schema from "./schema.js"

export type Database = NodePgDatabase<typeof schema> & { $client: Pool }

/** 注入数据库用的令牌：`@Inject(DATABASE) db: Database`。 */
export const DATABASE = Symbol("DATABASE")

/* 迁移文件随包发布在 apps/server/drizzle，源码与编译产物都在它往上两级。 */
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url))

/** 连接池与 drizzle 实例。创建时先把没执行过的迁移跑完，之后各模块才拿得到它。 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<Env, true>) => {
        const pool = new Pool({ connectionString: config.get("DATABASE_URL", { infer: true }) })
        const db = drizzle({ client: pool, schema })
        try {
          await migrate(db, { migrationsFolder: MIGRATIONS })
        } catch (error) {
          await pool.end()
          throw error
        }
        return db
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onApplicationShutdown() {
    await this.db.$client.end()
  }
}
