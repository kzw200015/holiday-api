import { describe, expect, test } from "bun:test"
import { deriveSecret } from "./deriveSecret"

describe("deriveSecret", () => {
  test("同一主密钥下不同用途派生出不同子密钥", () => {
    const forToken = deriveSecret("主密钥", "jwt-v1")
    const forAttachment = deriveSecret("主密钥", "attachment-v1")

    expect(forToken).not.toBe(forAttachment)
    // sha256 的十六进制表示固定 64 个字符
    expect(forToken).toMatch(/^[0-9a-f]{64}$/)
    // 同样的输入必须稳定，否则重启后所有令牌失效
    expect(deriveSecret("主密钥", "jwt-v1")).toBe(forToken)
  })

  test("换一把主密钥，同一个用途也会派生出不同的子密钥", () => {
    expect(deriveSecret("主密钥", "jwt-v1")).not.toBe(deriveSecret("另一把主密钥", "jwt-v1"))
  })
})
