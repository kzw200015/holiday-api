import { PostgreSqlContainer } from "@testcontainers/postgresql"
import type { TestProject } from "vitest/node"

declare module "vitest" {
  export interface ProvidedContext {
    postgresUrl: string
  }
}

/** 整个测试进程只起一个 PostgreSQL 容器，各测试文件在里面各建一个库，互不干扰。 */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer("postgres:18-alpine").start()
  project.provide("postgresUrl", container.getConnectionUri())
  return async () => {
    await container.stop()
  }
}
