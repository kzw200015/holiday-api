import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema.js";

const dbUrl = process.env.DB_URL;
if (!dbUrl) {
  throw new Error("环境变量 DB_URL 未设置");
}

/** postgres.js 连接实例 */
const sql = postgres(dbUrl);

/** Drizzle ORM 客户端 */
export const db = drizzle(sql, { schema });
