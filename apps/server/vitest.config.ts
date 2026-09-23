import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    /* 整个测试进程共用一个 PostgreSQL 容器，每个测试文件在里面建自己的库 */
    globalSetup: ["test/support/postgres.ts"],
    /* 起容器、跑迁移、算 argon2 都比默认的 5 秒慢 */
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
