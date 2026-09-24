import { createHmac, timingSafeEqual } from "node:crypto"
import { ForbiddenException, Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import type { Env } from "@/config.js"
import type { GalleryRef } from "@/eh/upstream/gallery-ref.js"
import { isDecimal } from "@/numeric.js"
import { SigningKeys } from "@/signing/signing.module.js"

/** 地址上固定的两个签名参数：e 是过期时间（毫秒），s 是签名值。 */
export interface Signature {
  e: string
  s: string
}

/**
 * 两类图片地址的签发与校验，写在同一处：两边哪天拼法不一致，表现就是所有图片突然打不开。
 *
 * 图片是浏览器的 <img src> 直接发起的请求，带不了 Authorization 头，所以不走令牌鉴权，改由服务端签发有时限的地址：
 * 签名覆盖「这是哪一份附件」加上过期时间（e，毫秒），任何一个字节被改过都对不上。签名（s）是 HMAC-SHA256 的前 128 位：
 * 地址本身会出现在浏览器历史和转发日志里，签得再长也挡不住转发泄露，所以有效期才是重点。
 * 已发出去的地址在换版本后必须照样验得过，签名的算法与地址的形状都不能改。
 */
@Injectable()
export class AttachmentUrls {
  private readonly key: Buffer
  private readonly ttl: number

  constructor(keys: SigningKeys, config: ConfigService<Env, true>) {
    this.key = keys.attachment
    this.ttl = config.get("ATTACHMENT_TTL", { infer: true })
  }

  /** 缩略图：签的是上游原始地址，校验通过才代理，客户端指定不了主机。 */
  thumbnail(raw: string): string {
    return `/api/eh/thumbnail?u=${Buffer.from(raw).toString("base64url")}&${this.sign(raw)}`
  }

  /** 大图地址模板：前端只把 {page} 换成页码，不必每页再问一次签名。 */
  imageTemplate(userId: number, ref: GalleryRef): string {
    return `/api/eh/galleries/${ref.gid}/${ref.token}/pages/{page}/image?uid=${userId}&${this.sign(imageSubject(userId, ref))}`
  }

  /** 校验缩略图地址，交回上游原始地址。 */
  checkThumbnail(encoded: string, signature: Signature): string {
    const raw = Buffer.from(encoded, "base64url").toString()
    if (!this.verify(raw, signature)) {
      throw new ForbiddenException("缩略图地址签名不正确或已过期")
    }
    return raw
  }

  /** 签名覆盖了 uid：改地址上的 uid 冒充别人就对不上，否则拿到一条地址就能用别人的 e 站凭据取图。 */
  checkImage(userId: number, ref: GalleryRef, signature: Signature) {
    if (!this.verify(imageSubject(userId, ref), signature)) {
      throw new ForbiddenException("图片地址签名不正确或已过期，回到详情页重进一次")
    }
  }

  /**
   * 过期时间不是精确的 now + ttl，而是往后对齐到有效期四分之一的窗口边界：同一个窗口里对同一份附件签出的地址一模一样。
   * 图片接口靠地址命中浏览器缓存，每次签出一个毫秒级不同的地址的话，翻回去看一眼也得再消耗一次 e 站配额。
   * 代价是实际有效期比配置的多出最多四分之一，只会长不会短。
   */
  private sign(subject: string): string {
    const window = Math.max(1, Math.floor(this.ttl / 4))
    const expiresAt = Math.ceil((Date.now() + this.ttl) / window) * window
    return `e=${expiresAt}&s=${this.digest(subject, expiresAt)}`
  }

  /** 签名与有效期都过才算数；垃圾输入返回 false 而不是抛出。 */
  private verify(subject: string, { e, s }: Signature): boolean {
    if (!isDecimal(e) || Number(e) <= Date.now()) {
      return false
    }
    const expected = Buffer.from(this.digest(subject, Number(e)))
    const actual = Buffer.from(s)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }

  private digest(subject: string, expiresAt: number): string {
    return createHmac("sha256", this.key).update(`${subject}:${expiresAt}`).digest().subarray(0, 16).toString("hex")
  }
}

/** 大图通行证签的是「谁能看哪个图集」，页码不在里面。 */
function imageSubject(userId: number, ref: GalleryRef) {
  return `${userId}:${ref.gid}:${ref.token}`
}
