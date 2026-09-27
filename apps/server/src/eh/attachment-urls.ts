import { timingSafeEqual } from "node:crypto"

import { env } from "@server/config"
import type { GalleryRef } from "@server/eh/upstream/gallery-ref"
import { forbidden } from "@server/http-error"
import { isDecimal } from "@server/numeric"
import { attachmentKey } from "@server/signing"

/** 地址上固定的两个签名参数：e 是过期时间（毫秒），s 是签名值。 */
export interface Signature {
  e: string
  s: string
}

/*
 * 两类图片地址的签发与校验，写在同一处：两边哪天拼法不一致，表现就是所有图片突然打不开。
 *
 * 图片是浏览器的 <img src> 直接发起的请求，带不了 Authorization 头，所以不走令牌鉴权，改由服务端签发有时限的地址：
 * 签名覆盖「这是哪一份附件」加上过期时间（e，毫秒），任何一个字节被改过都对不上。签名（s）是 HMAC-SHA256 的前 128 位：
 * 地址本身会出现在浏览器历史和转发日志里，签得再长也挡不住转发泄露，所以有效期才是重点。
 * 改了签名的算法或地址的形状，已发出去、还没过期的地址就一齐作废（最多三十来个小时），浏览器缓存的图也得重新取一遍。
 */

/** 缩略图：签的是上游原始地址，校验通过才代理，客户端指定不了主机。 */
export function thumbnail(raw: string): string {
  return `/api/eh/thumbnail?u=${Buffer.from(raw).toString("base64url")}&${sign(raw)}`
}

/** 某一页大图的地址，每页各签各的：阅读器取哪页就签哪页，不依赖详情什么时候下发。 */
export function image(userId: number, ref: GalleryRef, page: number): string {
  return `/api/eh/galleries/${ref.gid}/${ref.token}/pages/${page}/image?uid=${userId}&${sign(imageSubject(userId, ref, page))}`
}

/** 校验缩略图地址，交回上游原始地址。 */
export function checkThumbnail(encoded: string, signature: Signature): string {
  const raw = Buffer.from(encoded, "base64url").toString()
  if (!verify(raw, signature)) {
    throw forbidden("缩略图地址签名不正确或已过期")
  }
  return raw
}

/** 签名覆盖了 uid：改地址上的 uid 冒充别人就对不上，否则拿到一条地址就能用别人的 e 站凭据取图。 */
export function checkImage(userId: number, ref: GalleryRef, page: number, signature: Signature) {
  if (!verify(imageSubject(userId, ref, page), signature)) {
    throw forbidden("图片地址签名不正确或已过期")
  }
}

/**
 * 过期时间不是精确的 now + ttl，而是往后对齐到有效期四分之一的窗口边界：同一个窗口里对同一份附件签出的地址一模一样。
 * 图片接口靠地址命中浏览器缓存，每次签出一个毫秒级不同的地址的话，翻回去看一眼也得再消耗一次 e 站配额。
 * 代价是实际有效期比配置的多出最多四分之一，只会长不会短。
 */
function sign(subject: string): string {
  const ttl = env.ATTACHMENT_TTL
  const window = Math.max(1, Math.floor(ttl / 4))
  const expiresAt = Math.ceil((Date.now() + ttl) / window) * window
  return `e=${expiresAt}&s=${digest(subject, expiresAt)}`
}

/** 签名与有效期都过才算数；垃圾输入返回 false 而不是抛出。 */
function verify(subject: string, { e, s }: Signature): boolean {
  if (!isDecimal(e) || Number(e) <= Date.now()) {
    return false
  }
  const actual = Buffer.from(s)
  const expected = Buffer.from(digest(subject, Number(e)))
  /* 比较耗时与哪一位对不上无关，免得靠响应快慢一位位试出签名。timingSafeEqual 要求等长，签名长度固定，不是秘密 */
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function digest(subject: string, expiresAt: number): string {
  return new Bun.CryptoHasher("sha256", attachmentKey)
    .update(`${subject}:${expiresAt}`)
    .digest()
    .subarray(0, 16)
    .toString("hex")
}

/** 大图通行证签的是「谁能看哪个图集的哪一页」：改地址上的页码，签名就对不上。 */
function imageSubject(userId: number, ref: GalleryRef, page: number) {
  return `${userId}:${ref.gid}:${ref.token}:${page}`
}
