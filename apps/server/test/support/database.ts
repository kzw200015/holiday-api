import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { Client } from "pg"
import { inject } from "vitest"

/** 在共用的容器里新建一个空库，返回它的连接串。 */
export async function createDatabase(): Promise<string> {
  const server = inject("postgresUrl")
  const name = `test_${randomUUID().replaceAll("-", "")}`
  await sql(server, `CREATE DATABASE ${name}`)
  const url = new URL(server)
  url.pathname = `/${name}`
  return url.toString()
}

/** 在指定的库上执行一段 SQL，返回结果行。 */
export async function sql<T = Record<string, unknown>>(url: string, text: string, values: unknown[] = []) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    return (await client.query(text, values)).rows as T[]
  } finally {
    await client.end()
  }
}

/** Kotlin 版时期人工执行的建表脚本，原样保留在测试目录里，用来模拟线上已有的库。 */
export const LEGACY_SCHEMA = readFileSync(new URL("../fixtures/legacy-schema.sql", import.meta.url), "utf8")
