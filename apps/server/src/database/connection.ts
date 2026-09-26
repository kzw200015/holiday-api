import { SQL } from "bun"
import { drizzle } from "drizzle-orm/bun-sql"
import { migrate } from "drizzle-orm/bun-sql/migrator"

import { env } from "@server/config"

/* 迁移文件在 apps/server/drizzle，本文件往上两级 */
const MIGRATIONS = `${import.meta.dirname}/../../drizzle`

/* Bun 自带的 PostgreSQL 客户端：建出来时不连，第一次查询才把连接池开满 */
const client = new SQL(env.DATABASE_URL)

/** 整个进程共用的连接。开始接请求之前，启动流程先经 migrateDatabase 把迁移跑完。 */
export const database = drizzle({ client })

/** 执行 drizzle/ 下还没执行过的迁移。 */
export async function migrateDatabase() {
  await migrate(database, { migrationsFolder: MIGRATIONS })
}

/** 关停时关掉连接池。 */
export function closeDatabase(): Promise<void> {
  return client.close()
}
