import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { register, startApp, type TestApp } from "./support/app.js"
import { createDatabase, sql } from "./support/database.js"
import { html, withHolidays, type RecordedRequest } from "./support/outbound.js"

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
  it("表站与里站都放行：带里站权限绑上，之后的请求默认走里站，显式要表站时降级", async () => {
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
    await t.http.post("/api/eh/galleries/search").set(auth).send({ site: "e" }).expect(200)
    expect(t.outbound.last().url.host).toBe("e-hentai.org")
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

  it("各自整份替换、互不覆盖；分类排序去重后存，关键词原样存", async () => {
    const { auth } = await user()
    const read = async () => ({
      preferences: (await t.http.get("/api/eh/preferences").set(auth).expect(200)).body,
      history: (await t.http.get("/api/eh/search-history").set(auth).expect(200)).body,
    })
    /* 尚无这一行时先写搜索历史，偏好落表上的默认值 */
    await t.http
      .put("/api/eh/search-history")
      .set(auth)
      .send({ entries: ["b", "\u001c a"] })
      .expect(200)
    expect(await read()).toEqual({ preferences: { categories: [], readerInterval: 5 }, history: ["b", "\u001c a"] })

    await t.http
      .put("/api/eh/preferences")
      .set(auth)
      .send({ categories: ["manga", "doujinshi", "manga"], readerInterval: 9 })
      .expect(200)
    expect(await read()).toEqual({
      preferences: { categories: ["doujinshi", "manga"], readerInterval: 9 },
      history: ["b", "\u001c a"],
    })

    /* 清空就是提交一份空列表 */
    await t.http.put("/api/eh/search-history").set(auth).send({ entries: [] }).expect(200)
    expect(await read()).toEqual({
      preferences: { categories: ["doujinshi", "manga"], readerInterval: 9 },
      history: [],
    })
  })

  it("超出规则的整份退回", async () => {
    const { auth } = await user()
    const cases: [string, object, string][] = [
      ["/api/eh/preferences", { categories: ["comic"], readerInterval: 5 }, "分类名不合法"],
      ["/api/eh/preferences", { categories: [], readerInterval: 21 }, "自动翻页间隔应为 1–20 秒"],
      ["/api/eh/search-history", { entries: Array.from({ length: 11 }, (_, i) => `${i}`) }, "搜索历史最多 10 条"],
      ["/api/eh/search-history", { entries: ["汉".repeat(67)] }, "搜索历史关键词应为 1–200 字节"],
      ["/api/eh/search-history", { entries: [null] }, "搜索历史关键词应为 1–200 字节"],
    ]
    for (const [path, body, message] of cases) {
      const response = await t.http.put(path).set(auth).send(body)
      expect([response.status, response.body.message]).toEqual([400, [message]])
    }
  })
})
