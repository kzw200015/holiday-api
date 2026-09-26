import type { GalleryTag } from "@myapi/shared/eh"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { register, startApp, type TestApp } from "./support/app"
import { createDatabase, sql } from "./support/database"
import { isMetadataApi, metadata } from "./support/eh"
import { json, withHolidays } from "./support/outbound"

let t: TestApp
let databaseUrl: string
let auth: { Authorization: string }
/* 标签译名数据源这一刻回什么，由各用例自己换 */
let upstream: () => Response | Promise<Response>

const GID = 900500
const TOKEN = "0123456789"

beforeAll(async () => {
  databaseUrl = await createDatabase()
  t = await startApp(databaseUrl)
  t.outbound.respond = withHolidays((request) => {
    if (isMetadataApi(request)) {
      /* 没有冒号的 furtatooo 是临时标签：e 站给它们不带前缀 */
      const tags = ["language:chinese", "female:big breasts", "artist:nobody", "furtatooo"]
      return json({ gmetadata: [metadata(GID, TOKEN, { tags })] })
    }
    return request.url.host === "raw.githubusercontent.com" ? upstream() : undefined
  })
  auth = (await register(t.http)).auth
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.outbound.requests.length = 0
})

/** EhTagTranslation 的 db.text.json：命名空间 → 原文 → 译名。简介与链接用不上，照样带着，和真实数据一个形状。 */
function release(sha: string, namespaces: Record<string, Record<string, string>>) {
  return json({
    repo: "https://github.com/EhTagTranslation/Database.git",
    head: { sha },
    version: 7,
    data: Object.entries(namespaces).map(([namespace, tags]) => ({
      namespace,
      count: Object.keys(tags).length,
      frontMatters: {},
      data: Object.fromEntries(Object.entries(tags).map(([raw, name]) => [raw, { name, intro: "", links: "" }])),
    })),
  })
}

const status = async () => (await t.http.get("/api/eh/tag-translations").set(auth).expect(200)).body
const sync = () => t.http.post("/api/eh/tag-translations/sync").set(auth)
const tags = async () =>
  (await t.http.get(`/api/eh/galleries/${GID}/${TOKEN}`).set(auth).expect(200)).body.tags as GalleryTag[]
/* 每个标签显示成什么：命名空间的译名 / 标签的译名 */
const shown = async () => (await tags()).map(({ namespaceName, name }) => `${namespaceName}/${name}`)

describe("标签译名", () => {
  it("从未同步时标签显示原文，没有前缀的临时标签归到 temp", async () => {
    expect(await status()).toEqual({ lastSync: null })
    expect(await tags()).toEqual([
      { namespace: "language", namespaceName: "language", value: "chinese", name: "chinese" },
      {
        namespace: "female",
        namespaceName: "female",
        value: "big breasts",
        name: "big breasts",
      },
      { namespace: "artist", namespaceName: "artist", value: "nobody", name: "nobody" },
      { namespace: "temp", namespaceName: "temp", value: "furtatooo", name: "furtatooo" },
    ])
  })

  it("同步之后当场生效，不等元数据缓存过期；没收录的照旧显示原文", async () => {
    upstream = () =>
      release("sha-1", {
        rows: { language: "语言", female: "女性", temp: "临时" },
        language: { chinese: "汉语" },
        female: { "big breasts": "巨乳" },
      })
    const response = await sync().expect(200)
    expect(response.body).toEqual({ lastSync: { sha: "sha-1", count: 5, syncedAt: expect.any(String) } })
    expect(t.outbound.to("raw.githubusercontent.com").map(({ url }) => url.pathname)).toEqual([
      "/EhTagTranslation/Database/release/db.text.json",
    ])
    expect(await status()).toEqual(response.body)
    expect(await shown()).toEqual(["语言/汉语", "女性/巨乳", "artist/nobody", "临时/furtatooo"])
    /* 原文照旧给出，详情页要和译名一起显示 */
    expect((await tags())[1]).toMatchObject({ namespace: "female", value: "big breasts", name: "巨乳" })
  })

  it("再同步整表替换：上游删掉的译名不留，改过的换成新的", async () => {
    upstream = () =>
      release("sha-2", {
        rows: { language: "语言", female: "女性", temp: "临时" },
        female: { "big breasts": "大胸" },
      })
    expect((await sync().expect(200)).body.lastSync).toMatchObject({ sha: "sha-2", count: 4 })
    expect(await shown()).toEqual(["语言/chinese", "女性/大胸", "artist/nobody", "临时/furtatooo"])
    expect(await sql(databaseUrl, "SELECT count(*)::int AS count FROM eh_tag_translations")).toEqual([{ count: 4 }])
  })

  it("上游没变就不重写译名，只记下这次同步", async () => {
    const ids = await sql(databaseUrl, "SELECT id FROM eh_tag_translations ORDER BY id")
    const before = (await status()).lastSync
    const after = (await sync().expect(200)).body.lastSync
    expect(after).toMatchObject({ sha: "sha-2", count: 4 })
    expect(after.syncedAt >= before.syncedAt).toBe(true)
    expect(await sql(databaseUrl, "SELECT id FROM eh_tag_translations ORDER BY id")).toEqual(ids)
    expect(await sql(databaseUrl, "SELECT count(*)::int AS count FROM eh_tag_translation_syncs")).toEqual([
      { count: 3 },
    ])
  })

  it("拉不到、格式不对、拉到空的都回 502，库里已有的译名照用", async () => {
    const before = await status()
    for (const [response, message] of [
      [new Response("", { status: 500 }), "拉取标签译名失败，可能是连不上 GitHub"],
      [json({ data: [] }), "标签译名数据的格式不对，上游可能改了格式"],
      [release("sha-3", {}), "标签译名数据是空的"],
      [release("sha-3", { female: { "big breasts": "" } }), "标签译名数据是空的"],
    ] as const) {
      upstream = () => response
      const failed = await sync()
      expect([failed.status, failed.body.message]).toEqual([502, message])
    }
    expect(await status()).toEqual(before)
    expect(await shown()).toEqual(["语言/chinese", "女性/大胸", "artist/nobody", "临时/furtatooo"])
  })

  it("同时点了几次同步只拉一次，都拿到同一个结果", async () => {
    /* 上游慢一点，几次同步都在第一次拉取途中到达 */
    upstream = async () => {
      await Bun.sleep(200)
      return release("sha-4", { female: { "big breasts": "巨乳" } })
    }
    const responses = await Promise.all([sync(), sync(), sync()])
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(new Set(responses.map(({ body }) => JSON.stringify(body))).size).toBe(1)
    expect(t.outbound.to("raw.githubusercontent.com")).toHaveLength(1)
  })
})
