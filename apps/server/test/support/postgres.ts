import { PostgreSqlContainer } from "@testcontainers/postgresql"
import type { TestProject } from "vitest/node"

declare module "vitest" {
  export interface ProvidedContext {
    postgresUrl: string
  }
}

/**
 * 整个测试进程只起一个 PostgreSQL 容器，各测试文件在里面各建一个库，互不干扰。
 * Bun 的连接池第一次查询就把连接开满（默认 10 个）：几个测试文件的应用同时在跑，再加上启动失败没关掉的，
 * 也在默认的 100 个连接以内。
 */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer("postgres:18-alpine").start()
  project.provide("postgresUrl", container.getConnectionUri())
  return async () => {
    await container.stop()
  }
}
