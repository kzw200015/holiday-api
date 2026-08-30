import { beforeEach, describe, expect, test } from "bun:test"
import { createTestApp, loginAsTestUser, postJson as post, testUser as user } from "../testing/testApp"
import { ehFailure } from "./ehFailure"

/**
 * e 站路由的回归测试：只覆盖鉴权、参数校验、失败翻译和响应结构，
 * 不连数据库也不碰 e 站。断言比对完整 JSON 字符串，字段顺序变了就会失败。
 */
describe("EhController", () => {
  const { app, mocks } = createTestApp()
  const { ehService } = mocks
  const { login } = mocks.authService

  /** eh 下的接口都要登录，POST 也得把会话 Cookie 带上。 */
  const postJson = (requestPath: string, body: unknown) => post(app, requestPath, body, { Cookie: cookie })

  /** 登录一次拿到会话 Cookie，后面的请求都带着它。 */
  let cookie = ""

  /** 造一段可转发的图片流。 */
  function imageStream(bytes = [1, 2, 3]) {
    const response = new Response(new Uint8Array(bytes))
    return { body: response.body!, contentType: "image/webp", contentLength: String(bytes.length) }
  }

  beforeEach(async () => {
    for (const fake of Object.values(ehService)) {
      fake.mockReset()
    }
    login.mockReset()
    cookie = await loginAsTestUser(app, login)
  })

  const get = (requestPath: string) => app.request(requestPath, { headers: { Cookie: cookie } })

  test("未登录时所有 eh 接口都回 401", async () => {
    for (const requestPath of [
      "/api/eh/credential",
      "/api/eh/galleries",
      "/api/eh/galleries/2231376/a7584a5932",
      "/api/eh/galleries/2231376/a7584a5932/comments",
      "/api/eh/galleries/2231376/a7584a5932/pages/1/image",
      "/api/eh/thumbnail?u=abc&s=def",
    ]) {
      const res = await app.request(requestPath)
      expect(res.status).toBe(401)
      expect(await res.text()).toBe('{"code":401,"data":null,"msg":"请先登录"}')
    }
    expect(ehService.searchGalleries).not.toHaveBeenCalled()
  })

  test("图集编号或令牌不合法时返回 400", async () => {
    const cases: [string, string][] = [
      ["/api/eh/galleries/0/a7584a5932", "图集编号不合法"],
      ["/api/eh/galleries/abc/a7584a5932", "图集编号不合法"],
      // token 固定 10 位十六进制，会被拼进上游地址，必须卡死
      ["/api/eh/galleries/2231376/XYZ", "图集令牌不合法"],
      ["/api/eh/galleries/2231376/a7584a593", "图集令牌不合法"],
      ["/api/eh/galleries/2231376/a7584a5932ff", "图集令牌不合法"],
    ]
    for (const [requestPath, msg] of cases) {
      const res = await get(requestPath)
      expect(res.status).toBe(400)
      expect(await res.text()).toBe(`{"code":400,"data":null,"msg":"${msg}"}`)
    }
    expect(ehService.getGalleryDetail).not.toHaveBeenCalled()
  })

  test("页码不合法时返回 400", async () => {
    const res = await get("/api/eh/galleries/2231376/a7584a5932/pages/0/image")
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('{"code":400,"data":null,"msg":"页码不合法"}')
  })

  test("搜索把分类逗号列表拆成数组交给 service", async () => {
    ehService.searchGalleries.mockResolvedValue({ items: [], nextCursor: null })

    const res = await get("/api/eh/galleries?keyword=%E4%B8%AD%E6%96%87&categories=doujinshi,manga&cursor=4156820")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":{"items":[],"nextCursor":null},"msg":"OK"}')
    expect(ehService.searchGalleries).toHaveBeenCalledWith(7, {
      keyword: "中文",
      categories: ["doujinshi", "manga"],
      cursor: "4156820",
      site: undefined,
    })
  })

  test("搜索参数全省略时用空值兜底", async () => {
    ehService.searchGalleries.mockResolvedValue({ items: [], nextCursor: null })

    await get("/api/eh/galleries")
    expect(ehService.searchGalleries).toHaveBeenCalledWith(7, {
      keyword: "",
      categories: [],
      cursor: "",
      site: undefined,
    })
  })

  test("分页游标必须是数字", async () => {
    const res = await get("/api/eh/galleries?cursor=../../etc/passwd")
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('{"code":400,"data":null,"msg":"分页游标不合法"}')
  })

  test("详情返回元数据与阅读进度", async () => {
    ehService.getGalleryDetail.mockResolvedValue({
      gallery: {
        gid: 2231376,
        token: "a7584a5932",
        title: "标题",
        titleJpn: "",
        category: "Artist CG",
        thumbnail: "/api/eh/thumbnail?u=abc&s=def",
        uploader: "Pokom",
        postedAt: "2022-05-28T01:53:30.000Z",
        fileCount: 329,
        rating: 4.68,
        tags: ["artist:gentsuki"],
        fileSize: 419547090,
        torrentCount: 4,
        expunged: false,
      },
      progress: 12,
    })

    const res = await get("/api/eh/galleries/2231376/a7584a5932")
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ code: 200, data: { progress: 12 } })
    expect(ehService.getGalleryDetail).toHaveBeenCalledWith(7, { gid: 2231376, token: "a7584a5932" })
  })

  test("评论按片段返回，正文里不出现 HTML", async () => {
    ehService.getGalleryComments.mockResolvedValue([
      {
        id: 0,
        author: "Pokom",
        postedAt: "2022-05-28T01:53:00.000Z",
        isUploader: true,
        score: "",
        segments: [
          { type: "text", text: "Support:" },
          { type: "break" },
          { type: "link", text: "https://example.com/", href: "https://example.com/" },
        ],
      },
    ])

    const res = await get("/api/eh/galleries/2231376/a7584a5932/comments")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(
      '{"code":200,"data":[{"id":0,"author":"Pokom","postedAt":"2022-05-28T01:53:00.000Z","isUploader":true,' +
        '"score":"","segments":[{"type":"text","text":"Support:"},{"type":"break"},' +
        '{"type":"link","text":"https://example.com/","href":"https://example.com/"}]}],"msg":"OK"}',
    )
  })

  test("大图流式返回并带上长缓存头", async () => {
    ehService.openGalleryImage.mockResolvedValue(imageStream())

    const res = await get("/api/eh/galleries/2231376/a7584a5932/pages/3/image")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/webp")
    // 图集内容不会变，缓存住之后来回翻页就不再回源，也就不再消耗 e 站配额
    expect(res.headers.get("cache-control")).toBe("private, max-age=2592000, immutable")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(ehService.openGalleryImage).toHaveBeenCalledWith(7, { gid: 2231376, token: "a7584a5932" }, 3)
  })

  test("缩略图把签名原样交给 service 校验", async () => {
    ehService.openThumbnail.mockResolvedValue(imageStream([9]))

    const res = await get("/api/eh/thumbnail?u=aHR0cHM6Ly9laGd0Lm9yZy94LmpwZw&s=deadbeef")
    expect(res.status).toBe(200)
    expect(ehService.openThumbnail).toHaveBeenCalledWith(7, "aHR0cHM6Ly9laGd0Lm9yZy94LmpwZw", "deadbeef")
  })

  test("可预期的失败被翻译成对应状态码而不是 500", async () => {
    const cases: [Parameters<typeof ehFailure>[0], number][] = [
      ["quotaExceeded", 429],
      ["banned", 429],
      ["busy", 429],
      // Cookie 的问题要用户自己去处理，算请求方的错
      ["sadPanda", 400],
      ["unavailable", 502],
      ["contentWarning", 502],
    ]
    for (const [kind, status] of cases) {
      ehService.searchGalleries.mockRejectedValue(ehFailure(kind, `${kind} 的说明`))

      const res = await get("/api/eh/galleries")
      expect(res.status).toBe(status)
      expect(await res.text()).toBe(`{"code":${status},"data":null,"msg":"${kind} 的说明"}`)
    }
  })

  test("不认识的异常仍然走统一 500", async () => {
    ehService.searchGalleries.mockRejectedValue(new Error("数据库连不上"))

    const res = await get("/api/eh/galleries")
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('{"code":500,"data":null,"msg":"数据库连不上"}')
  })

  test("绑定 Cookie 时字段缺失返回 400", async () => {
    const res = await postJson("/api/eh/credential", { ipbMemberId: "", ipbPassHash: "x", igneous: "" })
    expect(res.status).toBe(400)
    expect(ehService.bindCredential).not.toHaveBeenCalled()
  })

  test("Cookie 校验不通过时把原因原样透出", async () => {
    ehService.bindCredential.mockResolvedValue({ ok: false, msg: "这组 Cookie 用不了，确认一下是否复制完整、是否已经过期" })

    const res = await postJson("/api/eh/credential", {
      ipbMemberId: "123",
      ipbPassHash: "abcdef",
      igneous: "",
    })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('{"code":400,"data":null,"msg":"这组 Cookie 用不了，确认一下是否复制完整、是否已经过期"}')
  })

  test("绑定成功返回绑定状态", async () => {
    ehService.bindCredential.mockResolvedValue({
      ok: true,
      status: { bound: true, memberId: "123", hasExAccess: true },
    })

    const res = await postJson("/api/eh/credential", {
      ipbMemberId: "123",
      ipbPassHash: "abcdef",
      igneous: "beef",
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":{"bound":true,"memberId":"123","hasExAccess":true},"msg":"OK"}')
  })

  test("上报阅读进度", async () => {
    ehService.saveProgress.mockResolvedValue(undefined)

    const res = await postJson("/api/eh/progress", { gid: 2231376, token: "a7584a5932", page: 42 })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":null,"msg":"OK"}')
    expect(ehService.saveProgress).toHaveBeenCalledWith(7, { gid: 2231376, token: "a7584a5932" }, 42)
  })
})
