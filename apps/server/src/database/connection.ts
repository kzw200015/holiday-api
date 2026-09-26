import { SQL } from "bun"
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql"
import { migrate } from "drizzle-orm/bun-sql/migrator"

export type Database = BunSQLDatabase & { $client: SQL }

/* 迁移文件在 apps/server/drizzle，本文件往上两级 */
const MIGRATIONS = `${import.meta.dirname}/../../drizzle`

/** 连接池（Bun 自带的 PostgreSQL 客户端）与 drizzle 实例。先把没执行过的迁移跑完再交出去，迁移失败就关掉连接池、原样抛出。 */
export async function connectDatabase(url: string): Promise<Database> {
  const client = new SQL(url)
  const db = drizzle({ client })
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS })
  } catch (error) {
    await client.close()
    throw error
  }
  return db
}
