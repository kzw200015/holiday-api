import { defineConfig } from "drizzle-kit"

/* drizzle-kit 只在开发时用：改了 src/database/schema.ts 之后生成迁移。迁移由服务启动时自动执行。 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
})
