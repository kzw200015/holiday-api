import { z } from "zod"

import { isDecimal } from "@server/numeric"

/** 图集定位信息：e 站用 gid 加 10 位十六进制的 token 认一本图集。 */
export interface GalleryRef {
  gid: number
  token: string
}

/** 图集令牌：10 位小写十六进制。路径与请求体里的令牌、上游页面链接里的令牌都按它认。 */
export const galleryTokenSchema = z.string({ error: "图集令牌不合法" }).regex(/^[0-9a-f]{10}$/, "图集令牌不合法")

/** 按图集查表、做缓存键时用的写法。 */
export const refKey = (ref: GalleryRef) => `${ref.gid}:${ref.token}`

/** 页面上的链接按 URL 的路径分段认；认不出的地址（包括相对地址，e 站页面上的链接都是绝对地址）是空数组。 */
function pathSegments(href: string | undefined): string[] {
  const url = URL.parse(href ?? "")
  return url ? url.pathname.split("/").filter(Boolean) : []
}

const isToken = (text: string) => galleryTokenSchema.safeParse(text).success

/** 图集链接 /g/<gid>/<token>/ 指向的图集。 */
export function galleryOfLink(href: string | undefined): GalleryRef | null {
  const [kind, gid = "", token = ""] = pathSegments(href)
  return kind === "g" && isDecimal(gid) && isToken(token) ? { gid: Number(gid), token } : null
}

/** 图片页链接 /s/<页令牌>/<gid>-<页码> 指向的那一页。 */
export function imagePageOfLink(href: string | undefined): { gid: number; page: number; token: string } | null {
  const [kind, token = "", location = ""] = pathSegments(href)
  const [gid = "", page = "", ...rest] = location.split("-")
  if (kind !== "s" || !isToken(token) || !isDecimal(gid) || !isDecimal(page) || rest.length > 0) {
    return null
  }
  return { gid: Number(gid), page: Number(page), token }
}
