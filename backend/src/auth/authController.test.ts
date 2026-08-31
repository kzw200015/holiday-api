import { beforeEach, describe, expect, test } from "bun:test"
import { createTestApp, loginAsTestUser, postJson as post, testUser as user } from "../testing/testApp"

/**
 * 账号路由与令牌鉴权的回归测试，不连数据库。
 * 除令牌本身（每次签出来都不一样）外，断言比对完整 JSON 字符串，字段顺序变化会导致测试失败。
 */
describe("AuthController", () => {
  const { app, mocks } = createTestApp()
  const { register, login, findUserById } = mocks.authService

  const postJson = (requestPath: string, body: unknown, headers: Record<string, string> = {}) =>
    post(app, requestPath, body, headers)

  /** 登录一次拿到 Authorization 头。 */
  const loginAndGetAuth = () => loginAsTestUser(app, login)

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

  test("注册成功后返回令牌与用户", async () => {
    register.mockResolvedValue({ ok: true, user })

    const res = await postJson("/api/auth/register", { username: "alice", password: "password123" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { code: number; data: { token: string; user: unknown }; msg: string }
    expect(body.code).toBe(200)
    expect(body.data.user).toEqual({ id: 7, username: "alice" })
    // 三段式的 JWT，具体内容由 JwtAuth 负责，这里只确认确实签了一个出来
    expect(body.data.token.split(".")).toHaveLength(3)
    expect(register).toHaveBeenCalledWith("alice", "password123")
  })

  test("用户名被占用时返回 400 且不签发令牌", async () => {
    register.mockResolvedValue({ ok: false, msg: "用户名已被占用" })

    const res = await postJson("/api/auth/register", { username: "alice", password: "password123" })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('{"code":400,"data":null,"msg":"用户名已被占用"}')
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

  test("带着令牌时 me 返回当前用户", async () => {
    const headers = await loginAndGetAuth()
    findUserById.mockResolvedValue(user)

    const res = await app.request("/api/auth/me", { headers })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":{"id":7,"username":"alice"},"msg":"OK"}')
    expect(findUserById).toHaveBeenCalledWith(7)
  })

  test("令牌有效但用户已被删除时按未登录处理", async () => {
    const headers = await loginAndGetAuth()
    findUserById.mockResolvedValue(null)

    const res = await app.request("/api/auth/me", { headers })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"code":200,"data":null,"msg":"OK"}')
  })

  test("被篡改的令牌不被承认", async () => {
    const { Authorization } = await loginAndGetAuth()
    // 改签名段的**第一个**字符。不能改最后一个：签名是 32 字节，base64url 编码成 43 个字符
    // 共 258 位，末位有 2 位是填充，A~D 之间互换解出来的字节完全一样，验签照样通过
    const [prefix, payload, signature = ""] = Authorization.split(".")
    const forged = `${prefix}.${payload}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`

    const res = await app.request("/api/auth/me", { headers: { Authorization: forged } })
    expect(await res.text()).toBe('{"code":200,"data":null,"msg":"OK"}')
    expect(findUserById).not.toHaveBeenCalled()
  })

  test("Authorization 头格式不对时按未登录处理", async () => {
    for (const Authorization of ["", "Bearer", "Basic abc", "Bearer not-a-jwt"]) {
      const res = await app.request("/api/auth/me", { headers: { Authorization } })
      expect(await res.text()).toBe('{"code":200,"data":null,"msg":"OK"}')
    }
    expect(findUserById).not.toHaveBeenCalled()
  })

  test("跨站发起的写请求拿不到身份，所以不需要 CSRF 中间件", async () => {
    // 浏览器能跨站直发的只有表单那几种 Content-Type。这类请求不会带上令牌
    // （令牌存在前端、要主动塞进 Authorization 头），所以到了需要登录的接口就是 401
    const res = await app.request("/api/eh/progress", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://evil.example" },
      body: "gid=1&token=a7584a5932&page=1",
    })
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('{"code":401,"data":null,"msg":"请先登录"}')
  })
})
