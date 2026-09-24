import type { Express } from "express"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { register, startApp, type TestApp } from "./support/app.js"
import { createDatabase } from "./support/database.js"
import { gallerySlice, image, imagePage, isMetadataApi, metadataApi, REF } from "./support/eh.js"
import { withHolidays } from "./support/outbound.js"

let t: TestApp
let auth: { Authorization: string }

beforeAll(async () => {
  t = await startApp(await createDatabase())
  t.outbound.respond = withHolidays((request) => {
    if (isMetadataApi(request)) {
      return metadataApi(request)
    }
    if (request.url.pathname.startsWith("/g/")) {
      return gallerySlice(REF.gid, 5, {
        extra:
          `<div id="cdiv"><div class="c1"><div class="c3">Posted on 28 May 2022, 01:53 by: &nbsp; <a>Pokom</a></div>` +
          `<div class="c4">Uploader Comment</div><div class="c6" id="comment_0">第一行<br/>` +
          `<a href="https://example.com/">链接</a></div></div></div>`,
      })
    }
    if (request.url.pathname.startsWith("/s/")) {
      return imagePage(`https://ehgt.org/p${request.url.pathname.split("-").at(-1)}.webp`)
    }
    return image()
  })
  auth = (await register(t.http)).auth
})
afterAll(async () => {
  await t?.close()
})

describe("鉴权边界", () => {
  /**
   * 按整张路由表扫，每条都不带令牌实际请求一次：不回 401 的恰好是这几条。逐条列路径的话，新加的接口没人记得补进来；
   * 反过来，图片接口要是被误改成要登录，<img> 就全打不开了。看的是响应而不是装饰器，Guard 的规则怎么改都照样锁得住。
   */
  it("公开接口恰好是这几条，其余不带令牌一律 401", async () => {
    const router = (t.app.getHttpAdapter().getInstance() as Express).router
    /* express 路由表里的方法名是小写的 */
    const routes = router.stack.flatMap(({ route }) =>
      route
        ? Object.keys((route as unknown as { methods: Record<string, boolean> }).methods).map((method) => ({
            method,
            path: route.path,
          }))
        : [],
    )
    /* 扫整张路由表，不只扫 /api 下的：漏写前缀的接口同样要被锁住 */
    const open: string[] = []
    for (const { method, path } of routes) {
      const response = await t.http[method as "get"](path.replaceAll(/:\w+/g, "1"))
      if (response.status !== 401) {
        open.push(`${method.toUpperCase()} ${path}`)
      }
    }
    expect(new Set(open)).toEqual(
      new Set([
        "GET /api/holiday/is-holiday",
        "GET /api/holiday/detail",
        "GET /api/auth/options",
        "POST /api/auth/register",
        "POST /api/auth/login",
        "GET /api/auth/me",
        "GET /api/eh/galleries/:gid/:token/pages/:page/image",
        "GET /api/eh/thumbnail",
      ]),
    )
    expect(routes.length - open.length).toBeGreaterThan(10)
  })

  it("未匹配的路径回 JSON 404，不先回 401；方法不对同样是 404", async () => {
    for (const path of ["/api/unknown", "/api", "/nowhere"]) {
      const response = await t.http.get(path)
      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ statusCode: 404, error: "Not Found" })
    }
    expect((await t.http.get("/api/eh/progress").set(auth)).status).toBe(404)
  })

  it("请求体不是合法 JSON 回 400", async () => {
    const response = await t.http.put("/api/eh/preferences").set(auth).set("Content-Type", "application/json").send("{")
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ statusCode: 400, error: "Bad Request" })
  })

  it("路径上的数字不是正整数、超出范围都回 400，文案与共享 schema 一致", async () => {
    for (const gid of ["abc", "1.5", "0", "-1", "0x10", "9223372036854775808", "9999999999999999"]) {
      const response = await t.http.delete(`/api/eh/history/${gid}`).set(auth)
      expect(response.status, gid).toBe(400)
      expect(response.body.message).toEqual(["图集编号不合法"])
    }
    const badToken = await t.http.get("/api/eh/galleries/1/NOTATOKEN").set(auth)
    expect(badToken.body.message).toEqual(["图集令牌不合法"])
  })
})

describe("响应体的 JSON 形状", () => {
  it("详情在卡片字段之上平铺出详情字段，时间是 ISO 8601，数字是数字", async () => {
    const response = await t.http.get(`/api/eh/galleries/${REF.gid}/${REF.token}`).set(auth).expect(200)
    expect(response.body).toEqual({
      gallery: {
        gid: REF.gid,
        token: REF.token,
        title: `标题 ${REF.gid}`,
        titleJpn: "",
        category: "Artist CG",
        thumbnail: expect.stringMatching(/^\/api\/eh\/thumbnail\?u=[\w-]+&e=\d+&s=[0-9a-f]{32}$/),
        uploader: "Pokom",
        postedAt: "2022-05-28T01:53:30.000Z",
        fileCount: 329,
        rating: 4.68,
        tags: ["artist:gentsuki"],
        fileSize: 419547090,
        torrentCount: 4,
        expunged: false,
      },
      progress: null,
      imageUrlTemplate: expect.stringMatching(
        new RegExp(
          `^/api/eh/galleries/${REF.gid}/${REF.token}/pages/\\{page\\}/image\\?uid=\\d+&e=\\d+&s=[0-9a-f]{32}$`,
        ),
      ),
    })
  })

  it("评论正文拆成文本、换行与链接片段", async () => {
    const response = await t.http.get(`/api/eh/galleries/${REF.gid}/${REF.token}/comments`).set(auth).expect(200)
    expect(response.body).toEqual([
      {
        id: 0,
        author: "Pokom",
        postedAt: "2022-05-28T01:53:00.000Z",
        isUploader: true,
        score: "",
        segments: [
          { type: "text", text: "第一行" },
          { type: "break" },
          { type: "link", text: "链接", href: "https://example.com/" },
        ],
      },
    ])
  })

  it("只回成败的接口回空体", async () => {
    const response = await t.http
      .put("/api/eh/preferences")
      .set(auth)
      .send({ categories: ["manga"], readerInterval: 5 })
      .expect(200)
    expect(response.text).toBe("")
  })

  /** 签名地址的闭环：详情签发的地址，图片接口必须认得出来。两边哪天拼法不一致，表现是所有图片突然打不开。 */
  it("详情签发的大图与缩略图地址不带令牌也打得开", async () => {
    const detail = (await t.http.get(`/api/eh/galleries/${REF.gid}/${REF.token}`).set(auth)).body
    const picture = await t.http.get(detail.imageUrlTemplate.replace("{page}", "3")).expect(200)
    expect(picture.headers["content-type"]).toBe("image/webp")
    expect(picture.headers["cache-control"]).toBe("max-age=2592000, private, immutable")
    expect(picture.headers["x-content-type-options"]).toBe("nosniff")
    expect(picture.headers["content-security-policy"]).toBe("sandbox")
    expect(Buffer.from(picture.body)).toEqual(Buffer.from([1, 2, 3]))
    await t.http.get(detail.gallery.thumbnail).expect(200)
  })
})
