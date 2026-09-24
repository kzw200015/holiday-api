import { SQL } from "bun"
import { drizzle } from "drizzle-orm/bun-sql"
import { migrate } from "drizzle-orm/bun-sql/migrator"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { startApp, type TestApp } from "./support/app"
import { createDatabase, LEGACY_SCHEMA, sql } from "./support/database"
import { gallerySlice, image, imagePage, isMetadataApi, metadata } from "./support/eh"
import { json, withHolidays } from "./support/outbound"

/*
 * 在 Kotlin 版留下的库上启动：迁移自动补上后续的变更，库里的账号、旧令牌、旧图片地址照常可用。
 * 下面几条令牌与地址是用 Kotlin 版的代码、以这把主密钥在 2026-09-01T00:00:00Z 签出来的原样结果。
 */
const GOLDEN_SECRET = "golden-secret-golden-secret-golden-secret"
const GOLDEN_NOW = new Date("2026-09-01T00:00:00Z")
const GOLDEN_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsImV4cCI6MTc5MDgxMjgwMH0.fx4WB9bThimwAyzpoJso6jhyFsCrf6CnX3HRJC5rvY0"
const GOLDEN_TEMPLATE =
  "/api/eh/galleries/2231376/a7584a5932/pages/{page}/image?uid=42&e=1788307200000&s=55664d869c3b5581d0acdf1c84e9020b"
const GOLDEN_THUMBNAIL =
  "/api/eh/thumbnail?u=aHR0cHM6Ly9laGd0Lm9yZy93LzAxLzIzNC81Njc4OS1hYmNkZWYud2VicA&e=1788307200000&s=6a15399f0773d62b41143ce5e83f083d"
const LEGACY_HASH = "$argon2id$v=19$m=65536,t=2,p=1$GWJ0cHAGWKo9G+ZbnLQTDA$DoZHSlziwVSiiOUfmY5r/+Vzuq4jc9hK6gaeBrbid8c"

let legacyUrl: string
let t: TestApp

beforeAll(async () => {
  legacyUrl = await createDatabase()
  await sql(legacyUrl, LEGACY_SCHEMA)
  await sql(
    legacyUrl,
    `INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (42, 'old-reader', $1, now(), now())`,
    [LEGACY_HASH],
  )
  /* 有的库是早期用别的工具建的，约束名与基线不同：迁移要把它们统一过来 */
  await sql(
    legacyUrl,
    `ALTER TABLE eh_credentials RENAME CONSTRAINT eh_credentials_user_id_fkey TO eh_credentials_user_id_users_id_fk;
     ALTER TABLE eh_credentials RENAME CONSTRAINT eh_credentials_cookie_not_null TO eh_credentials_cookie_encrypted_not_null`,
  )
  await sql(
    legacyUrl,
    `INSERT INTO eh_reading_progress (user_id, gid, token, page, writer, seq, created_at, updated_at)
     VALUES (42, 2231376, 'a7584a5932', 17, 'w', 3, now(), now())`,
  )
  /* Kotlin 版把凭据存成一列 JSON：一行三项齐全，一行缺了 igneous */
  await sql(
    legacyUrl,
    `INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (43, 'older-reader', $1, now(), now())`,
    [LEGACY_HASH],
  )
  await sql(
    legacyUrl,
    `INSERT INTO eh_credentials (user_id, member_id, cookie, has_ex_access, created_at, updated_at) VALUES
       (42, '777', '{"ipbMemberId":"777","ipbPassHash":"legacy","igneous":"ig"}', true, now(), now()),
       (43, '888', '{"ipbMemberId":"888","ipbPassHash":"older"}', false, now(), now())`,
  )
  t = await startApp(legacyUrl, { env: { SECRET_KEY: GOLDEN_SECRET } })
  t.outbound.respond = withHolidays((request) => {
    if (isMetadataApi(request)) {
      return json({
        gmetadata: [metadata(2231376, "a7584a5932", { thumb: "https://ehgt.org/w/01/234/56789-abcdef.webp" })],
      })
    }
    if (request.url.pathname.startsWith("/g/")) {
      return gallerySlice(2231376, 5)
    }
    if (request.url.pathname.startsWith("/s/")) {
      return imagePage("https://ehgt.org/golden.webp")
    }
    return image()
  })
})
afterAll(async () => {
  vi.useRealTimers()
  await t?.close()
})

describe("旧库升级", () => {
  it("迁移登记齐全，时间列有了默认值，旧数据原样保留", async () => {
    expect(await sql(legacyUrl, "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations")).toEqual([
      { count: 5 },
    ])
    const defaults = await sql<{ table_name: string; column_name: string; column_default: string }>(
      legacyUrl,
      `SELECT table_name, column_name, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name IN ('created_at', 'updated_at') ORDER BY 1, 2`,
    )
    expect(defaults).toHaveLength(10)
    expect(defaults.every((column) => column.column_default === "now()")).toBe(true)
    await t.http.post("/api/auth/login").send({ username: "old-reader", password: "correct horse 电池" }).expect(200)
  })

  it("凭据从一列 JSON 拆成三列，缺的项按空串算，绑定状态照旧", async () => {
    expect(
      await sql(legacyUrl, "SELECT user_id, ipb_member_id, ipb_pass_hash, igneous FROM eh_credentials ORDER BY 1"),
    ).toEqual([
      { user_id: "42", ipb_member_id: "777", ipb_pass_hash: "legacy", igneous: "ig" },
      { user_id: "43", ipb_member_id: "888", ipb_pass_hash: "older", igneous: "" },
    ])
    await t.http
      .get("/api/eh/credential")
      .set({ Authorization: `Bearer ${GOLDEN_TOKEN}` })
      .expect(200, { bound: true, memberId: "777", hasExAccess: true })
  })

  /** 基线迁移是幂等的：空库上建出来的结构，与旧库升级后的结构逐项一致。 */
  it("空库迁移出来的表结构与旧库升级后的一模一样", async () => {
    const fresh = await createDatabase()
    const client = new SQL(fresh)
    await migrate(drizzle({ client }), {
      migrationsFolder: `${import.meta.dirname}/../drizzle`,
    })
    await client.close()
    const structureOf = (url: string) =>
      Promise.all([
        sql(
          url,
          `SELECT table_name, column_name, data_type, is_nullable, column_default, is_identity
           FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`,
        ),
        sql(url, `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`),
        sql(
          url,
          `SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
           FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`,
        ),
      ])
    expect(await structureOf(fresh)).toEqual(await structureOf(legacyUrl))
  })
})

describe("Kotlin 版签发的令牌与图片地址", () => {
  it("旧令牌认得回，签名算法与地址形状逐字节一致", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: GOLDEN_NOW })
    const auth = { Authorization: `Bearer ${GOLDEN_TOKEN}` }
    await t.http.get("/api/auth/me").set(auth).expect(200, { id: 42, username: "old-reader" })

    const detail = (await t.http.get("/api/eh/galleries/2231376/a7584a5932").set(auth).expect(200)).body
    expect(detail.progress).toBe(17)
    /* 同一时刻签出的地址与 Kotlin 版的一模一样：旧地址继续命中浏览器缓存 */
    expect(detail.imageUrlTemplate).toBe(GOLDEN_TEMPLATE)
    expect(detail.gallery.thumbnail).toBe(GOLDEN_THUMBNAIL)

    await t.http.get(GOLDEN_TEMPLATE.replace("{page}", "1")).expect(200)
    await t.http.get(GOLDEN_THUMBNAIL).expect(200)
  })
})
