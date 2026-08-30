import { mock } from "bun:test"
import path from "node:path"
import { createApp } from "../app"
import type { User } from "../auth/authModels"
import { createSessionCookie } from "../auth/sessionCookie"

type AppOptions = Parameters<typeof createApp>[0]

/** 假 service 的方法签名一律从 createApp 的依赖类型里推，用例配置返回值时才有类型约束。 */
type Deps<K extends keyof AppOptions> = AppOptions[K]

/** 三个接口测试共用的登录者。加一列时只改这一处。 */
export const testUser: User = {
  id: 7,
  username: "alice",
  passwordHash: "$argon2id$whatever",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

/**
 * 测试用的应用装配：所有依赖先补成空 mock，用例只管配置自己关心的那几个。
 *
 * 有这层是因为 createApp 的依赖会一直加，每个测试文件各自写全套的话，
 * 加一个模块就要改所有测试文件，改动噪音比测试本身还大。返回 mocks 是同一个道理：
 * 用例直接拿这里建好的假对象去配置和断言，方法名单就不必在测试文件里再抄一遍。
 */
export function createTestApp(overrides: Partial<AppOptions> = {}) {
  const mocks = {
    holidayService: { query: mock<Deps<"holidayService">["query"]>() },
    ehService: {
      getCredentialStatus: mock<Deps<"ehService">["getCredentialStatus"]>(),
      bindCredential: mock<Deps<"ehService">["bindCredential"]>(),
      unbindCredential: mock<Deps<"ehService">["unbindCredential"]>(),
      searchGalleries: mock<Deps<"ehService">["searchGalleries"]>(),
      getGalleryDetail: mock<Deps<"ehService">["getGalleryDetail"]>(),
      getGalleryComments: mock<Deps<"ehService">["getGalleryComments"]>(),
      openGalleryImage: mock<Deps<"ehService">["openGalleryImage"]>(),
      openThumbnail: mock<Deps<"ehService">["openThumbnail"]>(),
      saveProgress: mock<Deps<"ehService">["saveProgress"]>(),
    },
    authService: {
      register: mock<Deps<"authService">["register"]>(),
      login: mock<Deps<"authService">["login"]>(),
      findUserById: mock<Deps<"authService">["findUserById"]>(),
    },
  }

  const app = createApp({
    ...mocks,
    sessionCookie: createSessionCookie({ secret: "test-secret", ttlMs: 60_000, secure: false }),
    trustedOrigins: [],
    // 指向一个不存在的目录，让所有非 /api 路径都落到 notFound
    staticDir: path.join(import.meta.dirname, "__no_static__"),
    ...overrides,
  })

  return { app, mocks }
}

/** 用 JSON 发一个同源的 POST。跨站请求会被 csrf 中间件挡掉，所以 Origin 必须给。 */
export function postJson(
  app: ReturnType<typeof createApp>,
  requestPath: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(requestPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost", ...headers },
    body: JSON.stringify(body),
  })
}

/** 登录一次，把会话 Cookie 原样切出来给后续请求复用。 */
export async function loginAsTestUser(
  app: ReturnType<typeof createApp>,
  login: { mockResolvedValue: (value: { ok: true; user: User }) => unknown },
): Promise<string> {
  login.mockResolvedValue({ ok: true, user: testUser })
  const res = await postJson(app, "/api/auth/login", { username: testUser.username, password: "password123" })
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
}
