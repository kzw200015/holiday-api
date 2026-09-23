import { createHash, createHmac } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { register, SECRET_KEY, startApp, type TestApp } from "./support/app.js"
import { createDatabase, sql } from "./support/database.js"

/* Kotlin 版（沿用自更早的 Go 版）生成的真实哈希，旧账号的密码必须照样验得过 */
const LEGACY_HASH = "$argon2id$v=19$m=65536,t=2,p=1$GWJ0cHAGWKo9G+ZbnLQTDA$DoZHSlziwVSiiOUfmY5r/+Vzuq4jc9hK6gaeBrbid8c"
const LEGACY_PASSWORD = "correct horse 电池"

let databaseUrl: string
let t: TestApp

beforeAll(async () => {
  databaseUrl = await createDatabase()
  t = await startApp(databaseUrl)
})
afterAll(async () => {
  vi.useRealTimers()
  await t?.close()
})

describe("注册与登录", () => {
  it("注册即登录，令牌认得出本人", async () => {
    const { token, username } = await register(t.http, "Register-User")
    const me = await t.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`).expect(200)
    expect(me.body).toEqual({ id: expect.any(Number), username })

    const login = await t.http.post("/api/auth/login").send({ username, password: "这个密码足够长了" }).expect(200)
    expect(login.body.user.username).toBe(username)
    await t.http.get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`).expect(200, me.body)
  })

  it("用户名唯一且区分大小写", async () => {
    await register(t.http, "Case-User")
    const taken = await t.http
      .post("/api/auth/register")
      .send({ username: "Case-User", password: "另一个足够长的密码" })
    expect(taken.status).toBe(400)
    expect(taken.body).toEqual({ statusCode: 400, message: "用户名已被占用", error: "Bad Request" })
    await register(t.http, "case-user")

    const wrongCase = await t.http.post("/api/auth/login").send({ username: "CASE-USER", password: "这个密码足够长了" })
    expect(wrongCase.body.message).toBe("用户名或密码错误")
  })

  it("用户不存在与密码不对回同一句话", async () => {
    await register(t.http, "wrong-pass")
    for (const body of [
      { username: "wrong-pass", password: "这个密码不是那个密码" },
      { username: "nobody-here", password: "这个密码足够长了" },
    ]) {
      const response = await t.http.post("/api/auth/login").send(body)
      expect(response.status).toBe(400)
      expect(response.body.message).toBe("用户名或密码错误")
    }
  })

  it("入参不合格时回共享 schema 的中文文案，不带字段路径", async () => {
    const response = await t.http.post("/api/auth/register").send({ username: "ab", password: "短" })
    expect(response.status).toBe(400)
    expect(response.body.message).toEqual(["用户名只能是 3 到 32 位的字母、数字、下划线或连字符", "密码至少 8 位"])
  })

  it("库里的旧 argon2id 哈希照样验得过，新哈希每次的盐都不同", async () => {
    await sql(databaseUrl, "INSERT INTO users (username, password_hash) VALUES ('legacy-user', $1)", [LEGACY_HASH])
    await t.http.post("/api/auth/login").send({ username: "legacy-user", password: LEGACY_PASSWORD }).expect(200)
    const wrong = await t.http.post("/api/auth/login").send({ username: "legacy-user", password: "correct horse 电" })
    expect(wrong.status).toBe(400)

    await register(t.http, "salt-a")
    await register(t.http, "salt-b")
    const rows = await sql<{ password_hash: string }>(
      databaseUrl,
      "SELECT password_hash FROM users WHERE username IN ('salt-a', 'salt-b')",
    )
    expect(rows).toHaveLength(2)
    for (const { password_hash } of rows) {
      const [, variant, version, params] = password_hash.split("$")
      expect([variant, version, params!.split(",").toSorted()]).toEqual(["argon2id", "v=19", ["m=65536", "p=1", "t=2"]])
    }
    expect(rows[0]!.password_hash).not.toBe(rows[1]!.password_hash)
  })
})

describe("登录令牌", () => {
  function sign(payload: object, key: Buffer, header: object = { alg: "HS256", typ: "JWT" }) {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
    const unsigned = `${encode(header)}.${encode(payload)}`
    return `${unsigned}.${createHmac("sha256", key).update(unsigned).digest("base64url")}`
  }
  /* 令牌子密钥的派生方式：SHA-256(主密钥 + ":token-v1") */
  const tokenKey = (secret: string) => createHash("sha256").update(`${secret}:token-v1`).digest()

  async function me(authorization: string | undefined) {
    const request = t.http.get("/api/auth/me")
    if (authorization !== undefined) {
      request.set("Authorization", authorization)
    }
    const response = await request.expect(200)
    return response.text === "" ? null : response.body
  }

  it("伪造载荷、alg: none、换密钥、坏格式一律当作没登录", async () => {
    const { token, userId } = await register(t.http)
    const [header, payload, signature] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ sub: String(userId + 1), exp: 9999999999 })).toString("base64url")
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
    const otherKey = sign(
      { sub: String(userId), exp: 9999999999 },
      tokenKey("另一把主密钥另一把主密钥另一把主密钥另一把"),
    )
    for (const authorization of [
      undefined,
      "",
      token,
      "Bearer ",
      `bearer ${token}`,
      "Bearer garbage",
      `Bearer ${header}.${payload}`,
      `Bearer ${header}.${forged}.${signature}`,
      `Bearer ${none}.${forged}.`,
      `Bearer ${otherKey}`,
    ]) {
      expect(await me(authorization), `${authorization} 不该认得`).toBeNull()
    }
    expect(await me(`Bearer ${sign({ sub: String(userId), exp: 9999999999 }, tokenKey(SECRET_KEY))}`)).toMatchObject({
      id: userId,
    })
  })

  it("过期的令牌不认，要登录的接口回 401", async () => {
    const { token } = await register(t.http)
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 31 * 24 * 3600 * 1000 })
    try {
      expect(await me(`Bearer ${token}`)).toBeNull()
      const response = await t.http.get("/api/eh/credential").set("Authorization", `Bearer ${token}`)
      expect(response.status).toBe(401)
      expect(response.body).toEqual({ statusCode: 401, message: "请先登录", error: "Unauthorized" })
    } finally {
      vi.useRealTimers()
    }
  })
})
