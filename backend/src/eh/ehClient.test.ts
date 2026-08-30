import { describe, expect, test } from "bun:test"
import { isAllowedImageUrl } from "./ehClient"

/**
 * 图片主机白名单是图片代理唯一的 SSRF 防线，所以单独测。
 * 这里列的绕过手法都是真会被人试的，改实现时这些用例必须继续过。
 */
describe("isAllowedImageUrl", () => {
  test("放行 e 站的图片主机", () => {
    for (const url of [
      "https://ehgt.org/w/02/611/26694-ftjxzayd.webp",
      "https://bvxhifw.isvxwqkwpklu.hath.network:62121/h/abc/keystamp=1-2/x.webp",
      "https://x.hath.network/h/abc/x.jpg",
    ]) {
      expect(isAllowedImageUrl(url)).toBe(true)
    }
  })

  test("挡住伪装成白名单的域名", () => {
    for (const url of [
      // 把白名单域名放在前缀里
      "https://ehgt.org.attacker.com/x.jpg",
      // 少一个点就会被 endsWith 放过去
      "https://evilhath.network/x.jpg",
      "https://attacker.com/ehgt.org/x.jpg",
      "https://ehgt.org.evil/x.jpg",
    ]) {
      expect(isAllowedImageUrl(url)).toBe(false)
    }
  })

  test("挡住内网地址与非 https 协议", () => {
    for (const url of [
      "http://ehgt.org/x.jpg",
      "https://127.0.0.1/x.jpg",
      "https://localhost:5432/x.jpg",
      "https://localhost/x.jpg",
      "file:///etc/passwd",
      "http://169.254.169.254/latest/meta-data/",
    ]) {
      expect(isAllowedImageUrl(url)).toBe(false)
    }
  })

  test("挡住 URL 里塞凭据的写法", () => {
    // user@host 这种形式能让粗心的主机名判断认错域
    expect(isAllowedImageUrl("https://ehgt.org@attacker.com/x.jpg")).toBe(false)
    expect(isAllowedImageUrl("https://user:pass@ehgt.org/x.jpg")).toBe(false)
  })

  test("挡住根本不是地址的输入", () => {
    for (const url of ["", "不是地址", "//ehgt.org/x.jpg", "javascript:alert(1)"]) {
      expect(isAllowedImageUrl(url)).toBe(false)
    }
  })
})
