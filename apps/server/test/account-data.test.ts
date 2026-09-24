import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { register, startApp, type TestApp } from "./support/app"
import { createDatabase, sql } from "./support/database"
import { html, withHolidays, type RecordedRequest } from "./support/outbound"

let t: TestApp
let databaseUrl: string

beforeAll(async () => {
  databaseUrl = await createDatabase()
  t = await startApp(databaseUrl)
})
afterAll(async () => {
  await t?.close()
})

const user = () => register(t.http)

/** 假的 e 站：表站 home.php 与里站首页各按给定的方式回应。 */
function eh(home: () => Response | Promise<Response>, ex: () => Response | Promise<Response>) {
  t.outbound.respond = withHolidays((request: RecordedRequest) => (request.url.host === "exhentai.org" ? ex() : home()))
}

const COOKIE = { ipbMemberId: "123", ipbPassHash: "hash", igneous: "ig" }

describe("绑定 e 站账号", () => {
  it("表站与里站都放行：带里站权限绑上，之后的请求走里站", async () => {
    const { auth } = await user()
    eh(
      () => html("home"),
      () => html("gallery list"),
    )
    const bound = await t.http.post("/api/eh/credential").set(auth).send(COOKIE).expect(201)
    expect(bound.body).toEqual({ bound: true, memberId: "123", hasExAccess: true })
    await t.http.get("/api/eh/credential").set(auth).expect(200, bound.body)

    /* 两次探测都带着这组 Cookie，外加固定的两项 */
    for (const request of t.outbound.requests.slice(-2)) {
      expect(request.headers.cookie).toBe("nw=1; sl=dm_2; ipb_member_id=123; ipb_pass_hash=hash; igneous=ig")
    }

    t.outbound.respond = withHolidays(() => html("<p>No hits found</p>"))
    await t.http.post("/api/eh/galleries/search").set(auth).send({}).expect(200)
    expect(t.outbound.last().url.host).toBe("exhentai.org")
  })

  it("里站回空页面或连不上时只当没有里站权限，表站已经证明凭据是好的", async () => {
    const { auth } = await user()
    for (const ex of [() => html(""), () => Promise.reject(new TypeError("fetch failed"))]) {
      eh(() => html("home"), ex)
      const response = await t.http.post("/api/eh/credential").set(auth).send(COOKIE).expect(201)
      expect(response.body.hasExAccess).toBe(false)
    }
  })

  it("凭据没被认下、封禁、连不上各回各的错，都不入库", async () => {
    const { auth, userId } = await user()
    const cases: [() => Response | Promise<Response>, number, string][] = [
      /* 未登录时 home.php 会 302 到论坛登录页 */
      [() => new Response("", { status: 302 }), 400, "这组 Cookie 用不了，确认一下是否复制完整、是否已经过期"],
      /* 200 也可能是封禁页：Cookie 本身没问题，不能报成「Cookie 用不了」 */
      [
        () => html("Your IP address has been temporarily banned"),
        429,
        "本机访问 e 站过于频繁已被临时限制，请过几分钟再试",
      ],
      [() => Promise.reject(new TypeError("fetch failed")), 502, "请求 e 站失败，可能是网络不通或超时"],
    ]
    for (const [home, status, message] of cases) {
      eh(home, () => html("ok"))
      const response = await t.http.post("/api/eh/credential").set(auth).send(COOKIE)
      expect([response.status, response.body.message]).toEqual([status, message])
    }
    expect(await sql(databaseUrl, "SELECT 1 FROM eh_credentials WHERE user_id = $1", [userId])).toEqual([])
  })

  it("入参不合格时不出网", async () => {
    const { auth } = await user()
    const before = t.outbound.requests.length
    const response = await t.http.post("/api/eh/credential").set(auth).send({ ipbMemberId: "1", ipbPassHash: "a; b" })
    expect(response.status).toBe(400)
    expect(response.body.message).toEqual(["Cookie 值里有不允许的字符，检查是不是多复制了分号、空格或引号"])
    expect(t.outbound.requests.length).toBe(before)
  })

  it("换绑整条替换，解绑后退回匿名浏览表站", async () => {
    const { auth } = await user()
    eh(
      () => html("home"),
      () => html("gallery list"),
    )
    await t.http.post("/api/eh/credential").set(auth).send(COOKIE).expect(201)
    eh(
      () => html("home"),
      () => html(""),
    )
    const rebound = await t.http.post("/api/eh/credential").set(auth).send({ ipbMemberId: "456", ipbPassHash: "other" })
    expect(rebound.body).toEqual({ bound: true, memberId: "456", hasExAccess: false })

    const unbound = await t.http.delete("/api/eh/credential").set(auth).expect(200)
    expect(unbound.body).toEqual({ bound: false, memberId: "", hasExAccess: false })
    t.outbound.respond = withHolidays(() => html("<p>No hits found</p>"))
    await t.http.post("/api/eh/galleries/search").set(auth).send({}).expect(200)
    const search = t.outbound.last()
    expect([search.url.host, search.headers.cookie]).toEqual(["e-hentai.org", "nw=1; sl=dm_2"])
  })
})

describe("偏好与搜索历史", () => {
  it("没有记录时回默认值", async () => {
    const { auth } = await user()
    expect((await t.http.get("/api/eh/preferences").set(auth).expect(200)).body).toEqual({
      categories: [],
      readerInterval: 5,
    })
    expect((await t.http.get("/api/eh/search-history").set(auth).expect(200)).body).toEqual([])
  })

  it("偏好只改带来的字段，分类排序去重后存；搜索历史一次记或删一个词，关键词原样存", async () => {
    const { auth } = await user()
    const read = async () => ({
      preferences: (await t.http.get("/api/eh/preferences").set(auth).expect(200)).body,
      history: (await t.http.get("/api/eh/search-history").set(auth).expect(200)).body,
    })
    const record = (keyword: string) => t.http.post("/api/eh/search-history").set(auth).send({ keyword }).expect(201)
    /* 尚无这一行时先记搜索历史，偏好落表上的默认值 */
    await record("\u001c a")
    await record("b")
    expect(await read()).toEqual({ preferences: { categories: [], readerInterval: 5 }, history: ["b", "\u001c a"] })

    await t.http
      .patch("/api/eh/preferences")
      .set(auth)
      .send({ categories: ["manga", "doujinshi", "manga"] })
      .expect(200)
    await t.http.patch("/api/eh/preferences").set(auth).send({ readerInterval: 9 }).expect(200)
    /* 再记一遍已有的词，它挪到最前而不是多一条 */
    await record("\u001c a")
    expect(await read()).toEqual({
      preferences: { categories: ["doujinshi", "manga"], readerInterval: 9 },
      history: ["\u001c a", "b"],
    })

    /* 要删的词在查询串里，`..` 这类放进路径会被规范化掉的写法照样删得掉 */
    await record("..")
    await t.http.delete("/api/eh/search-history/entry").query({ keyword: ".." }).set(auth).expect(200)
    await t.http.delete("/api/eh/search-history/entry").query({ keyword: "b" }).set(auth).expect(200)
    expect((await read()).history).toEqual(["\u001c a"])
    await t.http.delete("/api/eh/search-history").set(auth).expect(200)
    expect(await read()).toEqual({
      preferences: { categories: ["doujinshi", "manga"], readerInterval: 9 },
      history: [],
    })
  })

  it("搜索历史只留最近的 10 个词；同时记的几个词一个也不丢", async () => {
    const { auth } = await user()
    const words = Array.from({ length: 12 }, (_, i) => `词${i}`)
    await Promise.all(words.map((keyword) => t.http.post("/api/eh/search-history").set(auth).send({ keyword })))
    const history = (await t.http.get("/api/eh/search-history").set(auth).expect(200)).body as string[]
    expect(history).toHaveLength(10)
    expect(new Set(history).size).toBe(10)
    await t.http.post("/api/eh/search-history").set(auth).send({ keyword: "最新" }).expect(201)
    expect((await t.http.get("/api/eh/search-history").set(auth).expect(200)).body[0]).toBe("最新")
  })

  it("超出规则的退回", async () => {
    const { auth } = await user()
    const cases: [ReturnType<typeof t.http.patch>, string][] = [
      [t.http.patch("/api/eh/preferences").send({ categories: ["comic"] }), "分类名不合法"],
      [t.http.patch("/api/eh/preferences").send({ readerInterval: 21 }), "自动翻页间隔应为 1–20 秒"],
      [t.http.post("/api/eh/search-history").send({ keyword: "汉".repeat(67) }), "搜索历史关键词应为 1–200 字节"],
      [t.http.post("/api/eh/search-history").send({ keyword: null }), "搜索历史关键词应为 1–200 字节"],
      [t.http.delete("/api/eh/search-history/entry"), "搜索历史关键词应为 1–200 字节"],
    ]
    for (const [request, message] of cases) {
      const response = await request.set(auth)
      expect([response.status, response.body.message]).toEqual([400, [message]])
    }
  })
})
