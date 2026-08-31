/**
 * 附件地址签名器。
 *
 * 图片是由浏览器的 <img src> 直接发起的请求，带不了 Authorization 头，也就拿不到 JWT。
 * 所以附件不走令牌鉴权，改由服务端签发一个有时限的地址：签名覆盖「这是哪一份附件」
 * 加上过期时间，两者中任何一个字节被改过，签名都对不上。
 *
 * 签名截成 32 个十六进制字符（128 位）。伪造要在有效期内穷举 2^128，
 * 而地址本身会出现在浏览器历史和转发日志里，签得再长也挡不住转发泄露——所以有效期才是重点。
 */
export interface AttachmentSignature {
  /** 毫秒时间戳的十进制字符串，原样出现在地址里。 */
  expiresAt: string
  signature: string
}

export class AttachmentSigner {
  private readonly secret: string
  private readonly ttlMs: number

  constructor({ secret, ttlMs }: { secret: string; ttlMs: number }) {
    this.secret = secret
    this.ttlMs = ttlMs
  }

  /**
   * 给一段业务标识签名。subject 由调用方决定要保护什么：
   * 缩略图签的是上游地址，大图签的是「谁能看哪个图集」。
   *
   * 返回的是两个字段而不是拼好的查询串：拼地址是调用方的事，
   * 签发和校验收发同一种形状，两边才对得起来——这个类曾经一头吐查询串、
   * 一头收拆开的字符串，连它自己的单测都得先写个函数把地址拆回去才能验。
   */
  sign(subject: string): AttachmentSignature {
    const expiresAt = Date.now() + this.ttlMs
    return { expiresAt: String(expiresAt), signature: this.digest(subject, expiresAt) }
  }

  /** 校验签名与有效期，两者都过才算数。 */
  verify(subject: string, { expiresAt, signature }: AttachmentSignature): boolean {
    const expires = Number(expiresAt)
    if (!Number.isSafeInteger(expires) || expires <= Date.now()) {
      return false
    }

    const expected = this.digest(subject, expires)
    // 长度一致再比，timingSafeEqual 对长度不同的输入会直接抛错
    if (signature.length !== expected.length) {
      return false
    }
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  }

  private digest(subject: string, expiresAt: number): string {
    return new Bun.CryptoHasher("sha256", this.secret).update(`${subject}:${expiresAt}`).digest("hex").slice(0, 32)
  }
}
