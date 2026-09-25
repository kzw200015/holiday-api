import { html, json, type RecordedRequest } from "./outbound"
import { present } from "./present"

/** 从真实页面原样裁下来的 e 站样本（test/fixtures/eh/），不要格式化，解析器依赖的正是原文。 */
export function fixture(name: string): Promise<string> {
  return Bun.file(new URL(`../fixtures/eh/${name}`, import.meta.url)).text()
}

export const REF = { gid: 2231376, token: "a7584a5932" }

/** 元数据接口里的一条，数字按 e 站的习惯写成字符串。 */
export function metadata(gid: number, token: string, overrides: Record<string, unknown> = {}) {
  return {
    gid,
    token,
    title: `标题 ${gid}`,
    title_jpn: "",
    category: "Artist CG",
    thumb: `https://ehgt.org/t/${gid}.webp`,
    uploader: "Pokom",
    posted: "1653702810",
    filecount: "329",
    filesize: "419547090",
    expunged: false,
    rating: "4.68",
    torrentcount: "4",
    tags: ["artist:gentsuki"],
    ...overrides,
  }
}

export const isMetadataApi = (request: RecordedRequest) =>
  request.url.host.startsWith("api.") && request.body?.includes('"gdata"') === true

/** 这次元数据请求要的是哪几本。 */
export function requestedRefs(request: RecordedRequest): { gid: number; token: string }[] {
  const { gidlist } = JSON.parse(present(request.body, "元数据请求体")) as { gidlist: [number, string][] }
  return gidlist.map(([gid, token]) => ({ gid, token }))
}

/** 元数据接口：要什么回什么，除了 missing 里的（被删或转私有）。 */
export function metadataApi(request: RecordedRequest, missing: number[] = []) {
  return json({
    gmetadata: requestedRefs(request).map(({ gid, token }) =>
      missing.includes(gid) ? { gid, error: "Key missing, or incorrect key provided." } : metadata(gid, token),
    ),
  })
}

/** 一张图的响应。 */
export function image(body: Bun.BodyInit = "\u0001\u0002\u0003", contentType = "image/webp", status = 200) {
  return new Response(body, { status, headers: { "content-type": contentType } })
}

/** 测试里第 page 页的页令牌：页码的十六进制补到 10 位。 */
export const pageToken = (page: number) => page.toString(16).padStart(10, "0")

/**
 * 整本 total 页的图集详情页的一片：.gpc 里的页数说明、#gdt 里第 from–to 页的图片页链接，外加 extra（评论之类）。
 * 默认整本只有一片，格子里是空的；要预览图时由 cells 按页码给出格子里的内容。
 */
export function gallerySlice(
  gid: number,
  total: number,
  options: { from?: number; to?: number; extra?: string; cells?: Record<number, string> } = {},
) {
  const { from = 1, to = total, extra = "", cells = {} } = options
  const links = Array.from({ length: to - from + 1 }, (_, index) => {
    const page = from + index
    return `<a href="https://e-hentai.org/s/${pageToken(page)}/${gid}-${page}">${cells[page] ?? ""}</a>`
  }).join("")
  return html(`<p class="gpc">Showing ${from} - ${to} of ${total} images</p><div id="gdt">${links}</div>${extra}`)
}

/** 搜索结果页：按给定顺序列出这些图集的链接。 */
export function galleryList(refs: { gid: number; token: string }[]) {
  const rows = refs.map(({ gid, token }) => `<tr><td><a href="https://e-hentai.org/g/${gid}/${token}/"></a></td></tr>`)
  return html(`<table class="itg gltc">${rows.join("")}</table>`)
}

/** 图片页：大图指向 imageUrl。 */
export function imagePage(imageUrl: string, extra = "") {
  return html(`<div id="i3"><a href="#"><img id="img" src="${imageUrl}"></a></div>${extra}`)
}
