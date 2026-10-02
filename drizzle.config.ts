import { defineConfig } from "drizzle-kit"

/* drizzle-kit 只在开发时用：改了各领域的 *-tables.ts 之后生成迁移。迁移由服务启动时自动执行。 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/*/*-tables.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
})
