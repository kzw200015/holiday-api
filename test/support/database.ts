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

/** 在指定的库上执行一段 SQL。 */
export async function sql(url: string, text: string, values: unknown[] = []) {
  /* 只跑一条 SQL：Bun 的连接池第一次查询就按上限开满，不限成 1 个的话每调一次都要开 10 个连接 */
  const client = new SQL(url, { max: 1 })
  try {
    await client.unsafe(text, values)
  } finally {
    await client.close()
  }
}
