import { describe, expect, test } from "bun:test"
import { createSecretBox, deriveSecret } from "./secretBox"

describe("secretBox", () => {
  const box = createSecretBox("主密钥")

  test("加密后能还原出原文", async () => {
    const plain = "ipb_member_id=123456; ipb_pass_hash=deadbeef; igneous=abcdef01"
    expect(await box.open(await box.seal(plain))).toBe(plain)
  })

  test("同样的明文两次加密结果不同", async () => {
    // IV 随机，密文不应该可比对——否则能从密文相等推断出两个用户绑了同一个账号
    expect(await box.seal("同一句话")).not.toBe(await box.seal("同一句话"))
  })

  test("密文被篡改时抛错", async () => {
    const sealed = await box.seal("原文")
    const [iv, cipher = ""] = sealed.split(":")
    // 改掉密文首字符（末位的 base64 字符可能只承载填充位，改了不一定影响解码结果）
    const tampered = `${iv}:${cipher.startsWith("A") ? "B" : "A"}${cipher.slice(1)}`
    expect(box.open(tampered)).rejects.toThrow()
  })

  test("换一把密钥解不开", async () => {
    expect(createSecretBox("另一把密钥").open(await box.seal("原文"))).rejects.toThrow()
  })

  test("密文格式不对时给出明确提示", async () => {
    for (const bad of ["", "没有冒号", ":只有右边", "只有左边:"]) {
      expect(box.open(bad)).rejects.toThrow("密文格式错误，应为 base64(iv):base64(密文)")
    }
  })

  test("同一主密钥下不同用途派生出不同子密钥", () => {
    const forSession = deriveSecret("主密钥", "session-v1")
    const forThumb = deriveSecret("主密钥", "thumb-v1")

    expect(forSession).not.toBe(forThumb)
    // sha256 的十六进制表示固定 64 个字符
    expect(forSession).toMatch(/^[0-9a-f]{64}$/)
    // 同样的输入必须稳定，否则重启后所有会话失效
    expect(deriveSecret("主密钥", "session-v1")).toBe(forSession)
  })
})
