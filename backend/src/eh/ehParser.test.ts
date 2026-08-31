import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  classifyResponse,
  decodeEntities,
  parseGalleryComments,
  parseGalleryList,
  parseGalleryPage,
  parseImagePage,
  parseShowPageFragment,
  type ResponseKind,
} from "./ehParser"

/**
 * 解析器是这套东西里最脆的一层：e 站随时可能改版面。
 * 所以 fixture 全是从真实页面裁下来的（见 __fixtures__/ 各文件头部的来源注释），
 * 结构特征保持原样，只是删掉了用不上的部分。
 */
describe("ehParser", () => {
  const fixture = (name: string) => Bun.file(path.join(import.meta.dir, "__fixtures__", name)).text()

  describe("parseGalleryList", () => {
    test("按页面顺序取出图集并去重", async () => {
      const { items } = parseGalleryList(await fixture("galleryList.html"))

      // 同一个图集在一行里会出现在封面和标题两个链接上，去重后每个只剩一条
      expect(items).toEqual([
        { gid: 4156906, token: "f15507afa0" },
        { gid: 4156904, token: "7acd0468d3" },
        { gid: 4156901, token: "3d43767d8e" },
      ])
    })

    test("从分页导航取出下一页游标", async () => {
      // href 里的 & 是 &amp; 实体形式，不解码就取不到 next
      expect(parseGalleryList(await fixture("galleryList.html")).nextCursor).toBe("4156820")
    })

    test("最后一页没有游标", () => {
      // 翻到最后时 unext 从 <a> 变成 <span>，没有 href
      const html = '<div class="searchnav"><span id="unext">Next ></span></div>'
      expect(parseGalleryList(html).nextCursor).toBeNull()
    })

    test("没有命中时返回空列表而不是报错", async () => {
      expect(parseGalleryList(await fixture("galleryListEmpty.html"))).toEqual({ items: [], nextCursor: null })
    })

    test("不把长度不对的 token 当成图集", () => {
      // token 固定 10 位十六进制，短的长的都不能收
      expect(parseGalleryList('<a href="/g/123/abc/">x</a><a href="/g/456/0123456789abcdef/">y</a>').items).toEqual([])
    })
  })

  describe("parseGalleryPage", () => {
    test("取出每页的图片 token", async () => {
      const { pageTokens } = parseGalleryPage(await fixture("galleryPage.html"))

      expect(pageTokens).toEqual([
        { page: 1, token: "1ff5e361bb" },
        { page: 2, token: "fa27f217a6" },
        { page: 3, token: "60f2a8c343" },
      ])
    })

    test("总页数取自 Showing 那行而不是 token 个数", async () => {
      const { pageTokens, totalPages } = parseGalleryPage(await fixture("galleryPage.html"))

      // 一页详情只列 20 个 token，总数得另外读，否则 329 页的图集会被当成 20 页
      expect(totalPages).toBe(329)
      expect(pageTokens.length).not.toBe(totalPages)
    })

    test("总页数与本片区间都能吃掉千分位逗号", () => {
      const result = parseGalleryPage("<p>Showing 1,000 - 1,020 of 12,345 images</p>")

      expect(result.totalPages).toBe(12345)
      // 区间用来推算真实分片大小：登录用户能把每页图数从 20 改成 40 或 50
      expect(result.range).toEqual({ from: 1000, to: 1020 })
    })

    test("没有 Showing 那行时总页数与区间都是 null", () => {
      const result = parseGalleryPage("<html></html>")

      expect(result.totalPages).toBeNull()
      expect(result.range).toBeNull()
    })
  })

  describe("parseGalleryComments", () => {
    test("上传者留言被单独标记出来", async () => {
      const [uploaderComment] = parseGalleryComments(await fixture("galleryPage.html"))

      expect(uploaderComment?.id).toBe(0)
      expect(uploaderComment?.isUploader).toBe(true)
      expect(uploaderComment?.author).toBe("Pokom")
      // 上传者留言那格写的是 Uploader Comment，没有分数
      expect(uploaderComment?.score).toBe("")
    })

    test("普通评论带作者、分数与 UTC 时间", async () => {
      const comments = parseGalleryComments(await fixture("galleryPage.html"))

      expect(comments.length).toBe(3)
      expect(comments[1]).toMatchObject({
        id: 4567998,
        author: "伤心悲痛欲绝",
        isUploader: false,
        score: "+7",
        // 页面上写的 31 October 2021, 04:19 是 UTC
        postedAt: "2021-10-31T04:19:00.000Z",
      })
    })

    test("评论正文切成片段，换行和链接都保住", async () => {
      const [uploaderComment] = parseGalleryComments(await fixture("galleryPage.html"))
      const segments = uploaderComment?.segments ?? []

      expect(segments[0]).toEqual({ type: "text", text: "Support:" })
      expect(segments[1]).toEqual({ type: "break" })
      expect(segments).toContainEqual({
        type: "link",
        text: "https://e-hentai.org/g/2231377/5366ade18e/",
        href: "https://e-hentai.org/g/2231377/5366ade18e/",
      })
    })

    test("javascript 伪协议的链接降级成纯文本", () => {
      const html =
        '<div id="cdiv"><div class="c1"><div class="c6" id="comment_1"><a href="javascript:alert(1)">点我</a></div></div></div>'
      const [comment] = parseGalleryComments(html)

      // 不放行就意味着前端拿不到可点的 href，XSS 从源头断掉
      expect(comment?.segments).toContainEqual({ type: "text", text: "点我" })
      expect(comment?.segments.some((segment) => segment.type === "link")).toBe(false)
    })

    test("没有评论时返回空数组", () => {
      expect(parseGalleryComments('<div id="gdt"></div>')).toEqual([])
    })
  })

  describe("parseImagePage", () => {
    test("取出 showkey、图片地址与换源令牌", async () => {
      const result = parseImagePage(await fixture("imagePage.html"))

      expect(result.showKey).toBe("fqoint3an90")
      expect(result.imageUrl).toStartWith("https://bvxhifw.isvxwqkwpklu.hath.network:62121/h/")
      // 图床节点挂掉时靠这个令牌换一台机器重取
      expect(result.reloadToken).toBe("50398-496692")
    })

    test("页面不是图片页时三项都是 null", () => {
      expect(parseImagePage("<html><body>Content Warning</body></html>")).toEqual({
        showKey: null,
        imageUrl: null,
        reloadToken: null,
      })
    })
  })

  describe("parseShowPageFragment", () => {
    // 真实响应里 i3 的形状：本页的图，外面套着指向下一页的链接
    const i3 =
      `<a onclick="return load_image(4, 'cb8cbc96af')" href="https://e-hentai.org/s/cb8cbc96af/2231376-4">` +
      `<img id="img" src="https://x.hath.network/h/abc/keystamp=1-2/3834916_3.webp" style="..." /></a>`

    test("同时取出本页图片地址和下一页的 token", () => {
      // 下一页的 token 白送，顺序阅读就不用再回头请求详情页了
      expect(parseShowPageFragment(i3)).toEqual({
        imageUrl: "https://x.hath.network/h/abc/keystamp=1-2/3834916_3.webp",
        nextPage: { page: 4, token: "cb8cbc96af" },
      })
    })

    test("连续调用结果稳定", () => {
      // 带 g 标志的正则会记住 lastIndex，忘了归零的话第二次就找不到了
      expect(parseShowPageFragment(i3)).toEqual(parseShowPageFragment(i3))
    })

    test("最后一页没有下一页链接", () => {
      expect(parseShowPageFragment('<img id="img" src="https://x.hath.network/a.jpg" />').nextPage).toBeNull()
    })
  })

  describe("classifyResponse", () => {
    test("认出各种 200 但不是正常内容的响应", () => {
      const cases: [{ status: number; body: string }, ResponseKind][] = [
        [{ status: 509, body: "whatever" }, "quotaExceeded"],
        // 里站 Cookie 无效时回 200 加空 body，不是 403
        [{ status: 200, body: "" }, "sadPanda"],
        [{ status: 200, body: "   \n  " }, "sadPanda"],
        [{ status: 200, body: "Your IP address has been temporarily banned" }, "ipBanned"],
        [{ status: 200, body: "detected excessive pageloads" }, "ipBanned"],
        [{ status: 200, body: "<h1>Content Warning</h1>" }, "contentWarning"],
        // 搜索没命中是正常页面，交给 parseGalleryList 返回空列表即可
        [{ status: 200, body: "<p>No hits found</p>" }, "ok"],
        [{ status: 200, body: '<table class="itg">...</table>' }, "ok"],
      ]
      for (const [input, expected] of cases) {
        expect(classifyResponse(input)).toBe(expected)
      }
    })

    test("配额超限优先于其他判断", () => {
      // 509 的响应体也可能是空的，先判状态码才能给出准确的提示
      expect(classifyResponse({ status: 509, body: "" })).toBe("quotaExceeded")
    })
  })

  describe("decodeEntities", () => {
    test("解码常见实体", () => {
      // gdata 返回的标题就是转义过的，实测有 Arcueid &amp; Ciel x Goblin
      expect(decodeEntities("Arcueid &amp; Ciel x Goblin")).toBe("Arcueid & Ciel x Goblin")
      expect(decodeEntities("&lt;tag&gt; &quot;q&quot; &#039;a&#039;")).toBe(`<tag> "q" 'a'`)
      expect(decodeEntities("&#65;&#x42;")).toBe("AB")
    })

    test("不认识的实体原样保留", () => {
      expect(decodeEntities("&notreal; &amp;")).toBe("&notreal; &")
    })
  })
})
