import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { register, startApp, type TestApp } from "./support/app.js"
import { createDatabase, sql } from "./support/database.js"
import { isMetadataApi, metadataApi } from "./support/eh.js"
import { withHolidays } from "./support/outbound.js"

let t: TestApp
let databaseUrl: string

beforeAll(async () => {
  databaseUrl = await createDatabase()
  t = await startApp(databaseUrl)
  t.outbound.respond = withHolidays((request) =>
    isMetadataApi(request) ? metadataApi(request, [3]) : new Response("", { status: 599 }),
  )
})
afterAll(async () => {
  await t?.close()
})

async function user() {
  const { token, userId } = await register(t.http)
  return { userId, auth: { Authorization: `Bearer ${token}` } }
}

const TOKEN = "0123456789"

describe("阅读进度", () => {
  /** 前端不排队地上报进度，同一上报方先发的那次可能后到。 */
  it("同一上报方迟到的旧进度不算数，别的上报方照到达顺序覆盖", async () => {
    const { auth } = await user()
    const report = (page: number, writer: string, seq: number) =>
      t.http.post("/api/eh/progress").set(auth).send({ gid: 1, token: TOKEN, page, writer, seq }).expect(201)
    const progress = async () => (await t.http.get(`/api/eh/galleries/1/${TOKEN}`).set(auth).expect(200)).body.progress

    expect(await progress()).toBeNull()
    await report(30, "tab-a", 2)
    await report(3, "tab-a", 1)
    expect(await progress()).toBe(30)
    /* 同一个序号重放一遍也不算新的 */
    await report(4, "tab-a", 2)
    expect(await progress()).toBe(30)
    await report(5, "tab-b", 1)
    expect(await progress()).toBe(5)
  })

  it("上报的内容在落库前校验", async () => {
    const { auth } = await user()
    const response = await t.http
      .post("/api/eh/progress")
      .set(auth)
      .send({ gid: 1, token: TOKEN, page: 0, writer: "", seq: 1 })
    expect([response.status, response.body.message]).toEqual([400, ["页码不合法", "上报方标识不合法"]])
  })
})

describe("阅读历史", () => {
  it("按最近阅读排序、游标翻页；同一时刻的多行不漏不重；按账号隔离", async () => {
    const { auth, userId } = await user()
    const other = await user()
    /* 60 条，前 30 条的阅读时间一模一样（微秒都相同），靠 gid 排出稳定的顺序 */
    await sql(
      databaseUrl,
      `INSERT INTO eh_reading_progress (user_id, gid, token, page, writer, seq, updated_at)
       SELECT $1, gid, '${TOKEN}', 1, 'w', 1,
              CASE WHEN gid <= 30 THEN timestamptz '2026-01-01 00:00:00.123456+00'
                   ELSE timestamptz '2026-01-01 00:00:00.123456+00' + gid * interval '1 microsecond' END
       FROM generate_series(1, 60) AS gid`,
      [userId],
    )
    await t.http
      .post("/api/eh/progress")
      .set(other.auth)
      .send({ gid: 99, token: TOKEN, page: 1, writer: "w", seq: 1 })
      .expect(201)

    const seen: number[] = []
    let cursor = ""
    do {
      const page = (await t.http.get("/api/eh/history").query({ cursor }).set(auth).expect(200)).body
      seen.push(...page.items.map((item: { gid: number }) => item.gid))
      cursor = page.nextCursor ?? ""
    } while (cursor)
    expect(seen).toEqual(Array.from({ length: 60 }, (_, index) => 60 - index))
  })

  it("元数据取不到的那条 gallery 为 null，记录照样在；整批取不到则报错而不是全当失效", async () => {
    const { auth } = await user()
    for (const gid of [2, 3]) {
      await t.http.post("/api/eh/progress").set(auth).send({ gid, token: TOKEN, page: 7, writer: "w", seq: 1 })
    }
    const { items } = (await t.http.get("/api/eh/history").set(auth).expect(200)).body
    expect(items).toEqual([
      {
        gid: 3,
        token: TOKEN,
        page: 7,
        readAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        gallery: null,
      },
      {
        gid: 2,
        token: TOKEN,
        page: 7,
        readAt: expect.any(String),
        gallery: expect.objectContaining({ gid: 2, title: "标题 2" }),
      },
    ])

    const respond = t.outbound.respond
    t.outbound.respond = withHolidays(() => new Response("oops", { status: 500 }))
    const other = await user()
    await t.http
      .post("/api/eh/progress")
      .set(other.auth)
      .send({ gid: 1000, token: TOKEN, page: 1, writer: "w", seq: 1 })
    expect((await t.http.get("/api/eh/history").set(other.auth)).status).toBe(502)
    t.outbound.respond = respond
  })

  it("游标不合法时回 400", async () => {
    const { auth } = await user()
    for (const cursor of ["garbage", Buffer.from("2026-01-01,1").toString("base64url"), "x".repeat(300)]) {
      const response = await t.http.get("/api/eh/history").query({ cursor }).set(auth)
      expect(response.status, cursor).toBe(400)
      expect(JSON.stringify(response.body.message)).toContain("阅读历史游标不合法")
    }
  })

  it("删除一条、清空全部，对应的阅读进度也一起没了", async () => {
    const { auth } = await user()
    for (const gid of [5, 6, 7]) {
      await t.http.post("/api/eh/progress").set(auth).send({ gid, token: TOKEN, page: 2, writer: "w", seq: 1 })
    }
    await t.http.delete("/api/eh/history/6").set(auth).expect(200)
    expect((await t.http.get(`/api/eh/galleries/6/${TOKEN}`).set(auth)).body.progress).toBeNull()
    const gids = (await t.http.get("/api/eh/history").set(auth)).body.items.map((item: { gid: number }) => item.gid)
    expect(gids).toEqual([7, 5])

    await t.http.delete("/api/eh/history").set(auth).expect(200)
    expect((await t.http.get("/api/eh/history").set(auth)).body).toEqual({ items: [], nextCursor: null })
  })
})
