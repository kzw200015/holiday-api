import { beforeEach, describe, expect, test } from "bun:test"
import { createTestApp, loginAsTestUser, postJson as post, testUser as user } from "../testing/testApp"

/**
 * 账号路由与会话 Cookie 的回归测试，不连数据库。
 * 断言比对完整 JSON 字符串，响应字段顺序变化会导致测试失败。
 */
describe("AuthController", () => {
  const { app, mocks } = createTestApp()
  const { register, login, findUserById } = mocks.authService

  const postJson = (requestPath: string, body: unknown, headers: Record<string, string> = {}) =>
    post(app, requestPath, body, headers)

  const loginAndGetCookie = () => loginAsTestUser(app, login)

  beforeEach(() => {
    register.mockReset()
    login.mockReset()
    findUserById.mockReset()
  })

  test("用户名或密码格式不合规时返回 400", async () => {
    const cases: [unknown, string][] = [
      [{ username: "ab", password: "password123" }, "用户名只能是 3 到 32 位的字母、数字、下划线或连字符"],
      [{ username: "a b", password: "password123" }, "用户名只能是 3 到 32 位的字母、数字、下划线或连字符"],
      [{ username: "alice", password: "short" }, "密码至少 8 位"],
    ]
    for (const [body, msg] of cases) {
      const res = await postJson("/api/auth/register", body)
      expect(res.status).toBe(400)
      expect(await res.text()).toBe(`{"code":400,"data":null,"msg":"${msg}"}`)
    }
    expect(register).not.toHaveBeenCalled()
  })

  test("注册成功后返回用户并下发 HttpOnly 会话 Cookie", async () => {
    register.mockResolvedValue({ ok: true, user })

    const res = await postJson("/api/auth/register", { username: "alice", password: "password123" })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":{"id":7,"username":"alice"},"msg":"OK"}')
    expect(register).toHaveBeenCalledWith("alice", "password123")

    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("myapi_session=")
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("SameSite=Lax")
  })

  test("用户名被占用时返回 400 且不下发 Cookie", async () => {
    register.mockResolvedValue({ ok: false, msg: "用户名已被占用" })

    const res = await postJson("/api/auth/register", { username: "alice", password: "password123" })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('{"code":400,"data":null,"msg":"用户名已被占用"}')
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  test("密码错误时返回 400", async () => {
    login.mockResolvedValue({ ok: false, msg: "用户名或密码错误" })

    const res = await postJson("/api/auth/login", { username: "alice", password: "wrongpassword" })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('{"code":400,"data":null,"msg":"用户名或密码错误"}')
  })

  test("未登录时 me 返回 data 为 null 的 200", async () => {
    // 刻意不回 401：前端拦截器遇到 401 会跳登录页，而登录页自己也要问「我是谁」
    const res = await app.request("/api/auth/me")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":null,"msg":"OK"}')
    expect(findUserById).not.toHaveBeenCalled()
  })

  test("带着会话 Cookie 时 me 返回当前用户", async () => {
    const cookie = await loginAndGetCookie()
    findUserById.mockResolvedValue(user)

    const res = await app.request("/api/auth/me", { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":{"id":7,"username":"alice"},"msg":"OK"}')
    expect(findUserById).toHaveBeenCalledWith(7)
  })

  test("会话有效但用户已被删除时按未登录处理", async () => {
    const cookie = await loginAndGetCookie()
    findUserById.mockResolvedValue(null)

    const res = await app.request("/api/auth/me", { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":null,"msg":"OK"}')
  })

  test("被篡改的会话 Cookie 不被承认", async () => {
    const cookie = await loginAndGetCookie()
    // 把签名部分改掉，验签应该失败
    const forged = `${cookie.slice(0, -1)}${cookie.endsWith("A") ? "B" : "A"}`

    const res = await app.request("/api/auth/me", { headers: { Cookie: forged } })
    expect(await res.text()).toBe('{"code":200,"data":null,"msg":"OK"}')
    expect(findUserById).not.toHaveBeenCalled()
  })

  test("退出登录会清掉 Cookie", async () => {
    const res = await postJson("/api/auth/logout", {})
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":null,"msg":"OK"}')
    expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0")
  })

  test("跨站表单发起的写请求被 CSRF 中间件挡下", async () => {
    // 浏览器能跨站直发的只有表单那几种 Content-Type，JSON 会先触发 CORS 预检、在浏览器侧就被拦住，
    // 所以 csrf 中间件也只校验表单类请求。这里就按真实的攻击形态构造
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://evil.example" },
      body: "username=alice&password=password123",
    })
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('{"code":403,"data":null,"msg":"Forbidden"}')
    expect(login).not.toHaveBeenCalled()
  })

  test("同源发起的写请求不受 CSRF 影响", async () => {
    login.mockResolvedValue({ ok: true, user })

    const res = await postJson("/api/auth/login", { username: "alice", password: "password123" })
    expect(res.status).toBe(200)
  })
})
