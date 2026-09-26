import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { register, startApp, type TestApp } from "./support/app"
import { createDatabase } from "./support/database"
import { fixture, gallerySlice, image, imagePage, isMetadataApi, metadata, metadataApi, pageToken } from "./support/eh"
import { html, json, withHolidays, type RecordedRequest, type Responder } from "./support/outbound"
import { present } from "./support/present"

let t: TestApp
let gidSeed = 800000

beforeAll(async () => {
  t = await startApp(await createDatabase())
})
afterAll(async () => {
  await t?.close()
})
afterEach(() => {
  vi.useRealTimers()
})

/** 每个用例用自己的图集，免得命中别的用例留下的页令牌、showkey。 */
const nextRef = () => ({ gid: ++gidSeed, token: "0123456789" })

/**
 * 假的 e 站详情页：账号每片 size 个缩略图，整本 total 页。分片序号超出范围时 e 站退回最后一片。
 * 图片页的大图在 ehgt.org/<gid>/<页码>.webp。
 */
function gallery(total: number, size: number) {
  return (request: RecordedRequest): Response | undefined => {
    const { pathname, searchParams } = request.url
    if (pathname.startsWith("/g/")) {
      const gid = Number(pathname.split("/")[2])
      const index = Math.min(Number(searchParams.get("p")), Math.floor((total - 1) / size))
      const from = index * size + 1
      return gallerySlice(gid, total, { from, to: Math.min(from + size - 1, total) })
    }
    if (pathname.startsWith("/s/")) {
      const [gid, page] = pathname.split("/")[3]?.split("-") ?? []
      if (!gid || !page) {
        return undefined
      }
      return imagePage(`https://ehgt.org/${gid}/${page}.webp`)
    }
    return undefined
  }
}

/** 一位读者：注册、绑上一组独有的凭据（各自一个缓存作用域），能要到某本图集某一页的大图地址。 */
async function reader(respond: Responder) {
  const { auth } = await register(t.http)
  t.outbound.respond = withHolidays((request) => (request.url.host === "exhentai.org" ? html("") : html("home")))
  const member = String(++gidSeed)
  await t.http.post("/api/eh/credential").set(auth).send({ ipbMemberId: member, ipbPassHash: "hash" }).expect(200)
  t.outbound.respond = withHolidays((request) =>
    isMetadataApi(request) ? metadataApi(request) : request.url.host === "ehgt.org" ? image() : respond(request),
  )
  return {
    auth,
    member,
    async url(ref: { gid: number; token: string }, page: number): Promise<string> {
      return (
        await t.http.get(`/api/eh/galleries/${ref.gid}/${ref.token}/pages/${page}/image-url`).set(auth).expect(200)
      ).body.url
    },
  }
}

function pagesRequested(since: number) {
  return t.outbound.requests
    .slice(since)
    .filter((request) => request.url.host === "e-hentai.org")
    .map((request) => `${request.url.pathname}${request.url.search}`)
}

describe("签名地址", () => {
  it("改 uid、改过期时间、换签名、签名留空都回 403；缺签名参数回 400", async () => {
    const r = await reader((request) => gallery(5, 20)(request))
    const url = new URL(await r.url(nextRef(), 1), "http://x")
    const tampered = (name: string, value: string) => {
      const copy = new URL(url)
      copy.searchParams.set(name, value)
      return `${copy.pathname}${copy.search}`
    }
    await t.http.get(`${url.pathname}${url.search}`).expect(200)
    for (const forged of [
      tampered("uid", "999999"),
      tampered("e", String(Number(url.searchParams.get("e")) + 60_000)),
      tampered("s", "0".repeat(32)),
      tampered("e", "1e999"),
      tampered("s", ""),
    ]) {
      const response = await t.http.get(forged)
      expect([response.status, response.body.message]).toEqual([403, "图片地址签名不正确或已过期"])
    }
    /* 签名里有页码：拿第 1 页的签名去取第 2 页也不放行 */
    const otherPage = await t.http.get(`${url.pathname.replace("/pages/1/", "/pages/2/")}${url.search}`)
    expect([otherPage.status, otherPage.body.message]).toEqual([403, "图片地址签名不正确或已过期"])
    const missing = new URL(url)
    missing.searchParams.delete("s")
    const response = await t.http.get(`${missing.pathname}${missing.search}`)
    expect([response.status, response.body.message]).toEqual([400, ["图片地址缺少签名参数"]])
  })

  it("同一窗口里签出的地址一模一样，有效期不短于配置值，过期后不再放行、重新签一份就能接着取图", async () => {
    const r = await reader((request) => gallery(5, 20)(request))
    const ref = nextRef()
    /* 窗口是有效期（24 小时）的四分之一；起点刻意不落在整点上 */
    const start = new Date("2026-09-05T10:01:00Z").getTime()
    vi.useFakeTimers({ toFake: ["Date"], now: start })
    const since = t.outbound.requests.length
    const first = await r.url(ref, 1)
    /* 签名只在本机算，不访问 e 站 */
    expect(t.outbound.requests).toHaveLength(since)
    vi.setSystemTime(start + 10 * 60_000)
    expect(await r.url(ref, 1)).toBe(first)
    const expiresAt = Number(new URL(first, "http://x").searchParams.get("e"))
    expect(expiresAt).toBeGreaterThanOrEqual(start + 24 * 3600_000)

    vi.setSystemTime(expiresAt + 1)
    expect((await t.http.get(first)).status).toBe(403)
    const renewed = await r.url(ref, 1)
    expect(renewed).not.toBe(first)
    await t.http.get(renewed).expect(200)
  })

  it("缩略图地址改过就不放行", async () => {
    const r = await reader(() => html(""))
    const ref = nextRef()
    const thumbnail = (await t.http.get(`/api/eh/galleries/${ref.gid}/${ref.token}`).set(r.auth)).body.thumbnail
    await t.http.get(thumbnail).expect(200)
    const forged = thumbnail.replace(
      /u=[\w-]+/,
      `u=${Buffer.from("https://ehgt.org/other.webp").toString("base64url")}`,
    )
    const response = await t.http.get(forged)
    expect([response.status, response.body.message]).toEqual([403, "缩略图地址签名不正确或已过期"])
  })
})

describe("图片主机白名单", () => {
  /** 图片代理唯一的 SSRF 防线：元数据里给的缩略图地址也要过这一关。列的绕过手法都是真会被人试的。 */
  it("只放行 https 的 ehgt.org 与 *.hath.network", async () => {
    const r = await reader(() => html(""))
    const allowed = [
      "https://ehgt.org/w/02/611/26694-ftjxzayd.webp",
      /* H@H 节点用的是非标准端口 */
      "https://bvxhifw.isvxwqkwpklu.hath.network:62121/h/abc/keystamp=1-2/x.webp",
    ]
    const blocked = [
      "https://ehgt.org.attacker.com/x.jpg",
      "https://evilhath.network/x.jpg",
      "https://attacker.com/ehgt.org/x.jpg",
      "http://ehgt.org/x.jpg",
      "https://127.0.0.1/x.jpg",
      "https://localhost/x.jpg",
      "file:///etc/passwd",
      "http://169.254.169.254/latest/meta-data/",
      "https://ehgt.org@attacker.com/x.jpg",
      "https://user:pass@ehgt.org/x.jpg",
      "不是地址",
      "//ehgt.org/x.jpg",
      "javascript:alert(1)",
    ]
    /* 每个地址各用一本图集，拿到详情签发的缩略图地址 */
    const thumbnailOf = async (thumb: string) => {
      const ref = nextRef()
      t.outbound.respond = withHolidays((request) =>
        isMetadataApi(request) ? json({ gmetadata: [metadata(ref.gid, ref.token, { thumb })] }) : image(),
      )
      return (await t.http.get(`/api/eh/galleries/${ref.gid}/${ref.token}`).set(r.auth).expect(200)).body
        .thumbnail as string
    }
    for (const thumb of allowed) {
      const response = await t.http.get(await thumbnailOf(thumb))
      expect(response.status, thumb).toBe(200)
      /* 图床不认 e 站的身份，发过去只是白白泄露给第三方主机 */
      expect(t.outbound.last().headers.cookie).toBeUndefined()
    }
    for (const thumb of blocked) {
      const thumbnail = await thumbnailOf(thumb)
      const before = t.outbound.requests.length
      const response = await t.http.get(thumbnail)
      expect([response.status, response.body.message], thumb).toEqual([502, "图片地址不在允许的范围内"])
      expect(t.outbound.requests.length, thumb).toBe(before)
    }
  })
})

describe("图片流", () => {
  async function openWith(respondImage: () => Response | Promise<Response>) {
    const r = await reader((request) => gallery(5, 20)(request))
    const url = await r.url(nextRef(), 1)
    const respond = t.outbound.respond
    t.outbound.respond = (request) => (request.url.host === "ehgt.org" ? respondImage() : respond(request))
    return t.http.get(url)
  }

  it("上游不是图片、是 SVG、回 509 时不转发", async () => {
    const cases: [() => Response, number, string][] = [
      [() => image("<html>error</html>", "text/html"), 502, "图床返回的不是图片"],
      /* SVG 能带脚本 */
      [() => image("<svg/>", "image/svg+xml"), 502, "图床返回的不是图片"],
      [() => image("", "text/html", 509), 429, "e 站图片配额已用尽，等额度恢复后再试"],
    ]
    for (const [respond, status, message] of cases) {
      const response = await openWith(respond)
      expect([response.status, response.body.message]).toEqual([status, message])
      expect(response.headers["cache-control"]).toBeUndefined()
    }
  })

  /**
   * 上游在图片传到一半时断了：头还没发出去就改回普通的 502；已经发出去了就不能照常收尾——
   * 否则浏览器会把半张图当成完整的缓存 30 天——只能直接断开连接。
   */
  it("一个字节都没传就断了：回 502，不带图片的缓存头", async () => {
    const response = await openWith(() =>
      image(
        new ReadableStream({
          pull(controller) {
            controller.error(new Error("Connection reset"))
          },
        }),
        "image/jpeg",
      ),
    )
    expect([response.status, response.body.message]).toEqual([502, "图片传到一半，e 站那边断了"])
    expect(response.headers["cache-control"]).toBeUndefined()
  })

  it("传了一截才断：连接被直接断开，不当成完整的图片收尾", async () => {
    let sent = false
    const failure = await openWith(() =>
      image(
        new ReadableStream({
          async pull(controller) {
            if (sent) {
              /* 前一截已经转发给浏览器之后才断 */
              await new Promise((resolve) => setTimeout(resolve, 50))
              controller.error(new Error("Connection reset"))
            } else {
              sent = true
              controller.enqueue(new Uint8Array(64 * 1024))
            }
          },
        }),
        "image/jpeg",
      ),
    ).then(
      (response) => response,
      (error: Error) => error,
    )
    expect(failure instanceof Error ? failure.message : "").toMatch(/aborted|socket hang up|ECONNRESET/)
  })
})

describe("大图定位", () => {
  it("分片大小猜错、又落在最后一片时，从第一片推出真实的分片大小", async () => {
    /* 账号设的是每片 40 个：按默认的 20 猜，第 30 页在第 1 片，而第 1 片是 41–50，不满，推不出分片大小 */
    const small = await reader((request) => gallery(50, 40)(request))
    const ref = nextRef()
    let since = t.outbound.requests.length
    await t.http.get(await small.url(ref, 30)).expect(200)
    expect(pagesRequested(since)).toEqual([
      `/g/${ref.gid}/${ref.token}/?p=1`,
      `/g/${ref.gid}/${ref.token}/?p=0`,
      `/s/${pageToken(30)}/${ref.gid}-30`,
    ])

    /* 猜的第 3 片超出了范围，e 站退回最后一片 81–100；第一片给出分片大小 40，第 70 页在第 1 片 */
    const large = await reader((request) => gallery(100, 40)(request))
    const other = nextRef()
    since = t.outbound.requests.length
    await t.http.get(await large.url(other, 70)).expect(200)
    expect(pagesRequested(since).filter((path) => path.startsWith("/g/"))).toEqual([
      `/g/${other.gid}/${other.token}/?p=3`,
      `/g/${other.gid}/${other.token}/?p=0`,
      `/g/${other.gid}/${other.token}/?p=1`,
    ])
    /* 记住了这个账号的分片大小，换一本也一次猜中 */
    const third = nextRef()
    since = t.outbound.requests.length
    await t.http.get(await large.url(third, 70)).expect(200)
    expect(pagesRequested(since).filter((path) => path.startsWith("/g/"))).toEqual([
      `/g/${third.gid}/${third.token}/?p=1`,
    ])
  })

  it("页码超出图集页数时回 404", async () => {
    const r = await reader((request) => gallery(50, 40)(request))
    const response = await t.http.get(await r.url(nextRef(), 60))
    expect([response.status, response.body.message]).toEqual([404, "第 60 页超出了图集的页数（共 50 页）"])
  })

  it("同一片只抓一次，图片页顺带给出的下一页令牌直接用", async () => {
    const ref = nextRef()
    const r = await reader((request) => {
      if (request.url.pathname.startsWith("/s/")) {
        const page = Number(request.url.pathname.split("-").at(-1))
        return html(
          `<div id="i3"><a href="https://e-hentai.org/s/${"f".repeat(10)}/${ref.gid}-${page + 1}">` +
            `<img id="img" src="https://ehgt.org/${ref.gid}/${page}.webp"></a></div>`,
        )
      }
      return gallery(100, 20)(request)
    })
    const since = t.outbound.requests.length
    await t.http.get(await r.url(ref, 1)).expect(200)
    await t.http.get(await r.url(ref, 2)).expect(200)
    await t.http.get(await r.url(ref, 3)).expect(200)
    expect(pagesRequested(since)).toEqual([
      `/g/${ref.gid}/${ref.token}/?p=0`,
      `/s/${pageToken(1)}/${ref.gid}-1`,
      /* 第 2、3 页用的是前一页顺带给出的令牌，不是分片里的 */
      `/s/${"f".repeat(10)}/${ref.gid}-2`,
      `/s/${"f".repeat(10)}/${ref.gid}-3`,
    ])
  })

  it("拿到 showkey 之后走 showpage 接口，带着同一份身份；只有 showkey 失效才回退到抓图片页", async () => {
    const ref = nextRef()
    let showpage: () => Response = () => json({ i3: `<img id="img" src="https://ehgt.org/${ref.gid}/api.webp">` })
    const r = await reader((request) => {
      if (request.url.host === "api.e-hentai.org") {
        return showpage()
      }
      if (request.url.pathname.startsWith("/s/")) {
        return html(`<script>var showkey="key-1";</script><img id="img" src="https://ehgt.org/${ref.gid}/page.webp">`)
      }
      return gallery(100, 20)(request)
    })
    await t.http.get(await r.url(ref, 1)).expect(200)
    let since = t.outbound.requests.length
    await t.http.get(await r.url(ref, 2)).expect(200)
    const [call, picture] = t.outbound.requests.slice(since)
    expect(JSON.parse(present(call?.body, "showpage 请求体"))).toEqual({
      method: "showpage",
      gid: ref.gid,
      page: 2,
      imgkey: "0000000002",
      showkey: "key-1",
    })
    /* showkey 是登录的会话拿到的，兑换也得是同一个身份，否则按匿名算 */
    expect(call?.headers.cookie).toBe(`nw=1; sl=dm_2; ipb_member_id=${r.member}; ipb_pass_hash=hash`)
    expect(picture?.url.pathname).toBe(`/${ref.gid}/api.webp`)

    showpage = () => json({ error: "Key mismatch" })
    since = t.outbound.requests.length
    await t.http.get(await r.url(ref, 3)).expect(200)
    expect(pagesRequested(since)).toContain(`/s/${pageToken(3)}/${ref.gid}-3`)

    showpage = () => json({ error: "quota denied" })
    since = t.outbound.requests.length
    const refused = await t.http.get(await r.url(ref, 4))
    expect([refused.status, refused.body.message]).toEqual([502, "e 站图片接口拒绝了请求"])
    expect(pagesRequested(since).filter((path) => path.startsWith("/s/"))).toEqual([])
  })

  it("大图换成了配额提示图时报配额用尽", async () => {
    for (const quota of ["https://ehgt.org/g/509.gif", "https://exhentai.org/img/509s.gif"]) {
      const r = await reader((request) =>
        request.url.pathname.startsWith("/s/") ? html(`<img id="img" src="${quota}">`) : gallery(5, 20)(request),
      )
      const response = await t.http.get(await r.url(nextRef(), 1))
      expect([response.status, response.body.message]).toEqual([429, "e 站图片配额已用尽，等额度恢复后再试"])
    }
  })

  it("真实图片页：大图 onerror 里的 nl 用来换源，脚本里的 showkey 用来要下一页", async () => {
    const ref = nextRef()
    const page = await fixture("image-page.html")
    const r = await reader((request) => {
      if (request.url.host.endsWith(".hath.network:62121")) {
        return image("", "text/html", 403)
      }
      if (request.url.host === "api.e-hentai.org") {
        return json({ i3: `<img id="img" src="https://ehgt.org/${ref.gid}/api.webp">` })
      }
      if (request.url.pathname.startsWith("/s/")) {
        return request.url.searchParams.has("nl") ? imagePage(`https://ehgt.org/${ref.gid}/replaced.webp`) : html(page)
      }
      return gallery(5, 20)(request)
    })
    await t.http.get(await r.url(ref, 1)).expect(200)
    const reload = present(t.outbound.to("e-hentai.org").at(-1), "换源请求")
    expect(reload.url.searchParams.get("nl")).toBe("50398-496692")

    const since = t.outbound.requests.length
    await t.http.get(await r.url(ref, 2)).expect(200)
    const showpage = present(
      t.outbound.requests.slice(since).find((request) => request.url.host === "api.e-hentai.org"),
      "showpage 请求",
    )
    expect(JSON.parse(present(showpage.body, "showpage 请求体"))).toMatchObject({ page: 2, showkey: "fqoint3an90" })
  })

  it("图床节点失败或连不上时，用这一页自己的 nl 换源重试一次", async () => {
    for (const failure of [() => image("", "text/html", 403), () => Promise.reject(new TypeError("fetch failed"))]) {
      const ref = nextRef()
      const r = await reader((request) => {
        if (request.url.pathname.startsWith("/s/")) {
          return request.url.searchParams.get("nl") === "this-page"
            ? html(`<img id="img" src="https://ehgt.org/${ref.gid}/replaced.webp">`)
            : html(`<img id="img" src="https://ehgt.org/${ref.gid}/failed.webp" onerror="nl('this-page')">`)
        }
        return gallery(5, 20)(request)
      })
      const respond = t.outbound.respond
      t.outbound.respond = (request) => (request.url.pathname.endsWith("/failed.webp") ? failure() : respond(request))
      const since = t.outbound.requests.length
      await t.http.get(await r.url(ref, 2)).expect(200)
      expect(
        t.outbound.requests
          .slice(since)
          .map((request) => `${request.url.host}${request.url.pathname}${request.url.search}`),
      ).toEqual([
        `e-hentai.org/g/${ref.gid}/${ref.token}/?p=0`,
        `e-hentai.org/s/0000000002/${ref.gid}-2`,
        `ehgt.org/${ref.gid}/failed.webp`,
        `e-hentai.org/s/0000000002/${ref.gid}-2?nl=this-page`,
        `ehgt.org/${ref.gid}/replaced.webp`,
      ])
    }
  })

  it("换源之后还是取不到时回 502，文案里不带上游的状态码与地址", async () => {
    const ref = nextRef()
    const r = await reader((request) =>
      request.url.pathname.startsWith("/s/")
        ? html(`<img id="img" src="https://ehgt.org/${ref.gid}/failed.webp" onerror="nl('again')">`)
        : gallery(5, 20)(request),
    )
    const respond = t.outbound.respond
    t.outbound.respond = (request) =>
      request.url.pathname.endsWith("/failed.webp") ? image("", "text/html", 403) : respond(request)
    const since = t.outbound.requests.length
    const response = await t.http.get(await r.url(ref, 2))
    expect([response.status, response.body.message]).toEqual([502, "图床节点取不到这张图"])
    /* 只换源重试一次 */
    expect(t.outbound.requests.slice(since).filter((request) => request.url.host === "ehgt.org")).toHaveLength(2)
  })

  it("缩略图所在的图床节点取不到时回 502，不换源", async () => {
    const r = await reader(() => html(""))
    const ref = nextRef()
    const thumbnail = (await t.http.get(`/api/eh/galleries/${ref.gid}/${ref.token}`).set(r.auth).expect(200)).body
      .thumbnail
    const respond = t.outbound.respond
    t.outbound.respond = (request) =>
      request.url.host === "ehgt.org" ? Promise.reject(new TypeError("fetch failed")) : respond(request)
    const since = t.outbound.requests.length
    const response = await t.http.get(thumbnail)
    expect([response.status, response.body.message]).toEqual([502, "图床节点取不到这张图"])
    expect(t.outbound.requests.length).toBe(since + 1)
  })

  it("页面按身份隔离：换了凭据就不共用别人抓到的页", async () => {
    const ref = nextRef()
    const first = await reader((request) => gallery(5, 20)(request))
    const second = await reader((request) => gallery(5, 20)(request))
    await t.http.get(await first.url(ref, 1)).expect(200)
    const since = t.outbound.requests.length
    await t.http.get(await second.url(ref, 1)).expect(200)
    expect(pagesRequested(since)).toEqual([`/g/${ref.gid}/${ref.token}/?p=0`, `/s/0000000001/${ref.gid}-1`])
  })
})
