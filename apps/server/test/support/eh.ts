import { readFileSync } from "node:fs"

import { html, json, type RecordedRequest } from "./outbound.js"

/** 从真实页面原样裁下来的 e 站样本（test/fixtures/eh/），不要格式化，解析器依赖的正是原文。 */
export function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/eh/${name}`, import.meta.url), "utf8")
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
  const { gidlist } = JSON.parse(request.body!) as { gidlist: [number, string][] }
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
export function image(body: BodyInit = "\u0001\u0002\u0003", contentType = "image/webp", status = 200) {
  return new Response(body, { status, headers: { "content-type": contentType } })
}

/** 只有一片的图集：第 1–pages 页的图片页链接，外加一段评论。 */
export function gallerySlice(gid: number, pages: number, extra = "") {
  const links = Array.from(
    { length: pages },
    (_, index) =>
      `<a href="https://e-hentai.org/s/${(index + 1).toString(16).padStart(10, "0")}/${gid}-${index + 1}"></a>`,
  ).join("")
  return html(`Showing 1 - ${pages} of ${pages} images ${links}${extra}`)
}

/** 图片页：大图指向 imageUrl。 */
export function imagePage(imageUrl: string, extra = "") {
  return html(`<div id="i3"><a href="#"><img id="img" src="${imageUrl}"></a></div>${extra}`)
}
