import { describe, expect, test } from "bun:test"
import { AttachmentSigner } from "./attachmentSigner"

/**
 * 签名地址是图片接口唯一的鉴权手段——这两条接口不要求登录，签名过了就给图，
 * 所以这里的每个用例都对应一种「本不该放行却放行了」的后果。
 */
describe("AttachmentSigner", () => {
  const signer = new AttachmentSigner({ secret: "子密钥", ttlMs: 60_000 })

  test("自己签的地址能通过校验", () => {
    expect(signer.verify("https://ehgt.org/x.webp", signer.sign("https://ehgt.org/x.webp"))).toBe(true)
  })

  test("换一个 subject 就通不过", () => {
    // 否则拿到自己那张图的签名就能改改地址去拉别的东西
    const signature = signer.sign("7:2231376:a7584a5932")
    expect(signer.verify("8:2231376:a7584a5932", signature)).toBe(false)
    expect(signer.verify("7:2231377:a7584a5932", signature)).toBe(false)
  })

  test("改过期时间就通不过", () => {
    // 过期时间也在签名里，不然把 e 往后改一改就是一张永久通行证
    const { expiresAt, signature } = signer.sign("原文")
    expect(signer.verify("原文", { expiresAt: String(Number(expiresAt) + 60_000), signature })).toBe(false)
  })

  test("已经过期的地址不放行", () => {
    const expired = new AttachmentSigner({ secret: "子密钥", ttlMs: -1000 })
    expect(expired.verify("原文", expired.sign("原文"))).toBe(false)
  })

  test("换一把密钥签的地址不认", () => {
    expect(signer.verify("原文", new AttachmentSigner({ secret: "别的密钥", ttlMs: 60_000 }).sign("原文"))).toBe(false)
  })

  test("签名或过期时间是垃圾输入时返回 false 而不是抛错", () => {
    // timingSafeEqual 对长度不同的输入会抛错，长度必须先判
    const cases: [string, string][] = [
      ["", ""],
      ["abc", "deadbeef"],
      [String(Date.now() + 1000), ""],
      [String(Date.now() + 1000), "0".repeat(31)],
      [String(Date.now() + 1000), "0".repeat(33)],
      ["NaN", "0".repeat(32)],
      ["1e999", "0".repeat(32)],
    ]
    for (const [expiresAt, signature] of cases) {
      expect(signer.verify("原文", { expiresAt, signature })).toBe(false)
    }
  })
})
