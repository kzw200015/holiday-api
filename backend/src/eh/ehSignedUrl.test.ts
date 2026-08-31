import { describe, expect, test } from "bun:test"
import type { BunSQLDatabase } from "drizzle-orm/bun-sql"
import { createTestApp, loginAsTestUser } from "../testing/testApp"
import { AttachmentSigner } from "../crypto/attachmentSigner"
import type { EhClient } from "./ehClient"
import { EhCredentialStore } from "./ehCredentials"
import { EhImageLocator } from "./ehImageLocator"
import { EhService } from "./ehService"

/**
 * 签名地址的闭环：详情接口签发的地址，图片接口必须认得出来。
 *
 * 这一层单独测，是因为签名的 subject 在「签发」和「校验」两处各拼一次，
 * 两边哪天不一致，表现是所有图片突然打不开，而单元测试各自都是绿的。
 * 这也是 <img> 这条链路唯一的鉴权，所以顺带确认改 uid 冒充别人是不行的。
 */
describe("签名图片地址", () => {
  /** 假 db：这条链路只会查凭据和阅读进度，两者都返回空即可（未绑定 Cookie，匿名看前站）。 */
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
  } as unknown as BunSQLDatabase

  /** 假 ehClient：gdata 回一条能过 schema 的元数据，取图回一张 1 像素的图。 */
  const ehClient = {
    callApi: () =>
      Promise.resolve({
        gmetadata: [
          {
            gid: 2231376,
            token: "a7584a5932",
            title: "标题",
            title_jpn: "",
            category: "Artist CG",
            thumb: "https://ehgt.org/x.webp",
            uploader: "Pokom",
            posted: "1653702810",
            filecount: "329",
            filesize: "419547090",
            expunged: false,
            rating: "4.68",
            torrentcount: "4",
            tags: ["artist:gentsuki"],
          },
        ],
      }),
    fetchPage: (_ctx: unknown, pathAndQuery: string) =>
      // 取图要先抓详情页分片拿每页的令牌，再抓 /s/ 页面拿真正的图片地址，两种页面都得给
      Promise.resolve(
        pathAndQuery.startsWith("/s/")
          ? '<div id="i3"><a href="#"><img id="img" src="https://ehgt.org/p3.webp"></a></div>'
          : 'Showing 1 - 20 of 329 <a href="/s/bbbbbbbbbb/2231376-3">',
      ),
    openImage: () =>
      Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } })),
  } as unknown as EhClient

  /** 用真实的 EhService 组装一次，取回详情接口签发的那两条地址。 */
  async function fetchDetail() {
    const ehService = new EhService({
      db,
      ehClient,
      // 假 db 一律返回空行，所以这条链路走的是「未绑定凭据」，匿名看前站
      credentials: new EhCredentialStore({ db, ehClient }),
      imageLocator: new EhImageLocator(ehClient),
      attachmentSigner: new AttachmentSigner({ secret: "子密钥", ttlMs: 60_000 }),
    })
    const { app, mocks } = createTestApp({ ehService })
    const headers = await loginAsTestUser(app, mocks.authService.login)

    const res = await app.request("/api/eh/galleries/2231376/a7584a5932", { headers })
    const { data } = (await res.json()) as {
      data: { imageUrlTemplate: string; gallery: { thumbnail: string } }
    }
    return { app, data }
  }

  test("详情签发的大图地址能被图片接口认出来", async () => {
    const { app, data } = await fetchDetail()
    expect(data.imageUrlTemplate).toContain("{page}")

    // 前端只做这一件事：把 {page} 换成页码。不带 Authorization，走的就是 <img> 的形态
    const res = await app.request(data.imageUrlTemplate.replace("{page}", "3"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/webp")
  })

  test("把地址里的 uid 改成别人就取不到图", async () => {
    const { app, data } = await fetchDetail()

    // 签名覆盖了 uid，换个人就对不上——否则拿到一条地址就能用别人的 e 站凭据取图
    const forged = data.imageUrlTemplate.replace("{page}", "3").replace("uid=7", "uid=8")
    const res = await app.request(forged)
    // 403 而不是 502：签名不对是本站自己的判断，跟 e 站有没有故障无关
    expect(res.status).toBe(403)
    expect(await res.text()).toContain("签名不正确或已过期")
  })

  test("列表里的缩略图地址同样能自洽", async () => {
    const { app, data } = await fetchDetail()

    const res = await app.request(data.gallery.thumbnail)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/webp")
  })
})
