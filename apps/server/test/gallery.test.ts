import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { register, startApp, type TestApp } from "./support/app.js"
import { createDatabase } from "./support/database.js"
import { fixture, isMetadataApi, metadata, metadataApi, REF, requestedRefs } from "./support/eh.js"
import { html, json, withHolidays, type Responder } from "./support/outbound.js"

let t: TestApp
let auth: { Authorization: string }

beforeAll(async () => {
  t = await startApp(await createDatabase())
  auth = { Authorization: `Bearer ${(await register(t.http)).token}` }
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.outbound.requests.length = 0
})

function eh(respond: Responder) {
  t.outbound.respond = withHolidays(respond)
}

const search = (body: object = {}) => t.http.post("/api/eh/galleries/search").set(auth).send(body)

describe("搜索", () => {
  it("按页面顺序去重、解出下一页游标，元数据取不到的跳过", async () => {
    eh((request) => (isMetadataApi(request) ? metadataApi(request, [4156904]) : html(fixture("gallery-list.html"))))
    const response = await search().expect(200)
    expect(response.body.items.map((card: { gid: number }) => card.gid)).toEqual([4156906, 4156901])
    expect(response.body.nextCursor).toBe("4156820")
    /* 元数据一律匿名请求表站 */
    const metadataRequest = t.outbound.requests.find(isMetadataApi)!
    expect(metadataRequest.url.toString()).toBe("https://api.e-hentai.org/api.php")
    expect(metadataRequest.headers.cookie).toBe("nw=1; sl=dm_2")
  })

  it("没命中是空列表，最后一页没有游标；结果全被过滤掉的一页照样有游标", async () => {
    eh(() => html(fixture("empty-gallery-list.html")))
    expect((await search().expect(200)).body).toEqual({ items: [], nextCursor: null })

    eh(() => html(`<p>No unfiltered results in this page range.</p><a id="unext" href="/?next=100">Next</a>`))
    expect((await search().expect(200)).body).toEqual({ items: [], nextCursor: "100" })

    /* 什么都没认出来又不是「没有结果」，就是版面改了；令牌长度不对的链接不算图集 */
    eh(() => html(`<a href="/g/123/abc/">x</a><a href="/g/456/0123456789abcdef/">y</a>`))
    const changed = await search()
    expect([changed.status, changed.body.message]).toEqual([502, "没有识别出图集搜索结果，e 站版面可能改了"])
  })

  it("条件按表单编码拼进地址，分类换算成要排除的位和；全选与全不选都不加分类参数", async () => {
    eh(() => html("<p>No hits found</p>"))
    await search({ keyword: "a b&c", categories: ["manga", "doujinshi"], cursor: "123" }).expect(200)
    expect(t.outbound.requests.at(-1)!.url.search).toBe("?f_search=a+b%26c&f_cats=1017&next=123")

    const all = [
      "doujinshi",
      "manga",
      "artistcg",
      "gamecg",
      "western",
      "non-h",
      "imageset",
      "cosplay",
      "asianporn",
      "misc",
    ]
    await search({ categories: all }).expect(200)
    await search({ categories: [] }).expect(200)
    expect(t.outbound.requests.slice(-2).map((request) => request.url.search)).toEqual(["", ""])
  })

  it("条件在出网之前校验", async () => {
    for (const [body, message] of [
      [{ keyword: "汉".repeat(67) }, "关键词太长了"],
      [{ categories: ["comic"] }, "分类名不合法"],
      [{ cursor: "1&f_cats=0" }, "分页游标不合法"],
    ] as const) {
      const response = await search(body)
      expect([response.status, response.body.message]).toEqual([400, [message]])
    }
    expect(t.outbound.requests).toEqual([])
  })

  it("缓存里有的不再请求，缺的按批补齐，一批最多 25 本", async () => {
    const page = (gids: number[]) =>
      html(gids.map((gid) => `<a href="https://e-hentai.org/g/${gid}/0123456789/"></a>`).join(""))
    eh((request) => (isMetadataApi(request) ? metadataApi(request) : page([900001])))
    await search().expect(200)

    const gids = Array.from({ length: 30 }, (_, index) => 900001 + index)
    eh((request) => (isMetadataApi(request) ? metadataApi(request) : page(gids)))
    t.outbound.requests.length = 0
    const response = await search().expect(200)
    expect(response.body.items.map((card: { gid: number }) => card.gid)).toEqual(gids)
    const batches = t.outbound.requests
      .filter(isMetadataApi)
      .map((request) => requestedRefs(request).map((ref) => ref.gid))
    expect(batches.map((batch) => batch.length)).toEqual([25, 4])
    expect(batches.flat()).not.toContain(900001)
  })

  /** 详情和阅读历史常常同时要同一本：还在加载的那一份交给后到的请求，不再各打一次元数据接口。 */
  it("同一本图集的元数据同时被要两次，只向上游请求一次；加载失败不进缓存", async () => {
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    const ref = { gid: 900100, token: "0123456789" }
    eh(async (request) => {
      await released
      return metadataApi(request)
    })
    const first = t.http
      .get(`/api/eh/galleries/${ref.gid}/${ref.token}`)
      .set(auth)
      .then((r) => r)
    const second = t.http
      .get(`/api/eh/galleries/${ref.gid}/${ref.token}`)
      .set(auth)
      .then((r) => r)
    await new Promise((resolve) => setTimeout(resolve, 100))
    release()
    expect((await first).status).toBe(200)
    expect((await second).status).toBe(200)
    expect(t.outbound.requests.filter(isMetadataApi)).toHaveLength(1)

    const failing = { gid: 900200, token: "0123456789" }
    eh(() => new Response("oops", { status: 500 }))
    expect((await t.http.get(`/api/eh/galleries/${failing.gid}/${failing.token}`).set(auth)).status).toBe(502)
    eh((request) => metadataApi(request))
    await t.http.get(`/api/eh/galleries/${failing.gid}/${failing.token}`).set(auth).expect(200)
  })
})

describe("上游失败的识别", () => {
  /**
   * 「200 但不是你要的东西」有好几种，全都必须识别出来：只看状态码的话，IP 被封时会被当成正常页面解析出空列表，
   * 然后继续按原节奏请求，把临时封禁续成长期封禁。
   */
  it("表站搜索页的各种失败", async () => {
    const cases: [Response | Error, number, string][] = [
      [html("whatever", 509), 429, "e 站图片配额已用尽，等额度恢复后再试"],
      /* 509 的响应体也可能是空的，先判状态码才能给出准确的提示 */
      [html("", 509), 429, "e 站图片配额已用尽，等额度恢复后再试"],
      /* 表站回空页面是出口 IP 被封了，跟 Cookie 无关 */
      [html(""), 429, "本机访问 e 站过于频繁已被临时限制，请过几分钟再试"],
      [
        html("Your IP address has been temporarily banned for excessive pageloads."),
        429,
        "本机访问 e 站过于频繁已被临时限制，请过几分钟再试",
      ],
      [html("<html>Bad Gateway</html>", 502), 502, "e 站返回了 HTTP 502"],
      /* 正常的页面请求不会重定向，会重定向说明身份没被认下来 */
      [html("<html>go away</html>", 302), 502, "e 站返回了 HTTP 302"],
      [new TypeError("fetch failed"), 502, "请求 e 站失败，可能是网络不通或超时"],
    ]
    for (const [response, status, message] of cases) {
      eh(() => (response instanceof Error ? Promise.reject(response) : response.clone()))
      const result = await search()
      expect([result.status, result.body.message], message).toEqual([status, message])
    }
  })

  it("正常页面里出现封禁、内容警告的字眼不算失败", async () => {
    eh((request) =>
      isMetadataApi(request)
        ? metadataApi(request)
        : html(
            `<a href="/g/1/0123456789/">x</a><div class="c6">I got temporarily banned lol</div>` +
              `<input name="f_search" value="Content Warning">`,
          ),
    )
    expect((await search().expect(200)).body.items).toHaveLength(1)
  })

  it("里站回空页面是 Cookie 失效或没有权限，要用户自己处理", async () => {
    const { token } = await register(t.http)
    const exAuth = { Authorization: `Bearer ${token}` }
    eh((request) => (request.url.host === "exhentai.org" ? html("gallery list") : html("home")))
    await t.http.post("/api/eh/credential").set(exAuth).send({ ipbMemberId: "1", ipbPassHash: "h", igneous: "i" })
    for (const response of [html(""), html("   \n  "), new Response("", { status: 302 })]) {
      eh(() => response.clone())
      const result = await t.http.post("/api/eh/galleries/search").set(exAuth).send({})
      expect([result.status, result.body.message]).toEqual([
        400,
        "里站没有放行这次请求，检查一下绑定的 Cookie 是否仍然有效",
      ])
    }
    /* 5xx 是 e 站自己出了状况，不能说成 Cookie 失效 */
    eh(() => html("", 503))
    expect((await t.http.post("/api/eh/galleries/search").set(exAuth).send({})).status).toBe(502)
  })

  it("元数据接口：标题里有封禁、内容警告的字眼不算失败，解不开的封禁页才算", async () => {
    const title = "Content Warning - I got temporarily banned for excessive pageloads &amp; &notreal;"
    eh((request) =>
      isMetadataApi(request)
        ? json({ gmetadata: [metadata(900300, "0123456789", { title, tags: ["other:a &amp; b"] })] })
        : html(""),
    )
    const detail = await t.http.get("/api/eh/galleries/900300/0123456789").set(auth).expect(200)
    /* HTML 实体只认带分号且真实存在的写法 */
    expect(detail.body.gallery.title).toBe(
      "Content Warning - I got temporarily banned for excessive pageloads & &notreal;",
    )
    expect(detail.body.gallery.tags).toEqual(["other:a & b"])

    eh(() => html("Your IP address has been temporarily banned for excessive pageloads"))
    expect((await t.http.get("/api/eh/galleries/900301/0123456789").set(auth)).status).toBe(429)
    eh(() => json({ error: "Invalid gidlist" }))
    const rejected = await t.http.get("/api/eh/galleries/900302/0123456789").set(auth)
    expect([rejected.status, rejected.body.message]).toEqual([502, "e 站元数据接口拒绝了请求：Invalid gidlist"])
  })

  it("详情页没解析出来时才认内容警告页与 e 站的说明页", async () => {
    const comments = (body: string) => {
      eh(() => html(body))
      return t.http.get(`/api/eh/galleries/900400/0123456789/comments`).set(auth)
    }
    const warning = await comments(`<div class="d"><p>Content Warning</p><p>This gallery has been flagged.</p></div>`)
    expect([warning.status, warning.body.message]).toEqual([502, "e 站返回了内容警告页，nw cookie 可能已失效"])
    const removed = await comments(`<div class="d"><p>This gallery has been removed or is unavailable.</p></div>`)
    expect([removed.status, removed.body.message]).toEqual([
      404,
      "e 站提示：This gallery has been removed or is unavailable.",
    ])
    const changed = await comments("<html><body>something else</body></html>")
    expect([changed.status, changed.body.message]).toEqual([502, "图集页面没有可识别的图片令牌"])
  })
})

describe("详情与评论", () => {
  it("详情取不到图集时回 404", async () => {
    eh((request) => metadataApi(request, [900500]))
    const response = await t.http.get("/api/eh/galleries/900500/0123456789").set(auth)
    expect([response.status, response.body.message]).toEqual([404, "这个图集取不到，可能已被删除或转为私有"])
  })

  it("真实详情页上的评论：上传者留言、分数、UTC 时间与片段", async () => {
    eh(() => html(fixture("gallery-page.html")))
    const response = await t.http.get(`/api/eh/galleries/${REF.gid}/${REF.token}/comments`).set(auth).expect(200)
    const [uploader, normal, third] = response.body
    expect(response.body).toHaveLength(3)
    expect(uploader).toMatchObject({
      id: 0,
      author: "Pokom",
      isUploader: true,
      score: "",
      postedAt: "2022-05-28T01:53:00.000Z",
    })
    expect(uploader.segments.slice(0, 4)).toEqual([
      { type: "text", text: "Support:" },
      { type: "break" },
      { type: "text", text: "https://gentuki0999.fanbox.cc/" },
      { type: "break" },
    ])
    expect(uploader.segments.at(-1)).toEqual({
      type: "link",
      text: "https://e-hentai.org/g/2231377/5366ade18e/",
      href: "https://e-hentai.org/g/2231377/5366ade18e/",
    })
    expect(normal).toMatchObject({
      id: 4567998,
      author: "伤心悲痛欲绝",
      isUploader: false,
      score: "+7",
      postedAt: "2021-10-31T04:19:00.000Z",
    })
    /* 每行首尾的空白去掉，只剩空白的行不留文本片段 */
    expect(normal.segments).toEqual([
      { type: "text", text: "Mark In ２０２１happyHelloween！" },
      { type: "break" },
      { type: "text", text: "実にいいわ～たまらない。" },
      { type: "break" },
      { type: "text", text: "#[Gentsuki]" },
      { type: "break" },
      { type: "text", text: "【#ゲンツキ】" },
      { type: "break" },
      { type: "break" },
      { type: "text", text: "社保" },
    ])
    expect(third.score).toBe("+30")
  })

  it("只放行 http/https 的链接，javascript: 降级成纯文本", async () => {
    eh(() =>
      html(
        `<a href="/s/aaaaaaaaaa/900600-1">1</a><div id="cdiv"><div class="c1"><div class="c6" id="comment_1">` +
          `<a href="javascript:alert(1)">点我</a> 和 <a href="data:text/html,x">这个</a></div></div></div>`,
      ),
    )
    const response = await t.http.get("/api/eh/galleries/900600/0123456789/comments").set(auth).expect(200)
    expect(response.body[0].segments).toEqual([{ type: "text", text: "点我 和 这个" }])
  })
})
