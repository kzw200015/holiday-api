import { SQL } from "bun"
import { inject } from "vitest"

/** 在共用的容器里新建一个空库，返回它的连接串。 */
export async function createDatabase(): Promise<string> {
  const server = inject("postgresUrl")
  const name = `test_${crypto.randomUUID().replaceAll("-", "")}`
  await sql(server, `CREATE DATABASE ${name}`)
  const url = new URL(server)
  url.pathname = `/${name}`
  return url.toString()
}

/** 在指定的库上执行一段 SQL，返回结果行。 */
export async function sql<T = Record<string, unknown>>(url: string, text: string, values: unknown[] = []) {
  /* 只跑一条 SQL：Bun 的连接池第一次查询就按上限开满，不限成 1 个的话每调一次都要开 10 个连接 */
  const client = new SQL(url, { max: 1 })
  try {
    /* 结果是带 count、command 的数组，摊成普通数组好直接比较 */
    return [...(await client.unsafe(text, values))] as T[]
  } finally {
    await client.close()
  }
}

/** Kotlin 版时期人工执行的建表脚本，原样保留在测试目录里，用来模拟线上已有的库。 */
export const LEGACY_SCHEMA = await Bun.file(new URL("../fixtures/legacy-schema.sql", import.meta.url)).text()
