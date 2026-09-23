import { describe, expect, it } from "vitest"
import type { z } from "zod"

import {
  credentialsSchema,
  ehCookieSchema,
  galleryPreferencesSchema,
  gallerySearchSchema,
  holidayQuerySchema,
  readingProgressSchema,
  searchHistorySchema,
} from "../src/index.js"

/* 失败时给出的全部文案；通过时为空数组。 */
function errors(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe("注册与登录", () => {
  const valid = { username: "user_1-a", password: "12345678" }

  it("用户名只收 3–32 位的字母、数字、下划线与连字符", () => {
    expect(errors(credentialsSchema, valid)).toEqual([])
    for (const username of ["ab", "a".repeat(33), "中文名", "user name", "", undefined]) {
      expect(errors(credentialsSchema, { ...valid, username })).toEqual([
        "用户名只能是 3 到 32 位的字母、数字、下划线或连字符",
      ])
    }
  })

  it("密码长度按码点数：3 个汉字不够 8 位，8 个表情符号够", () => {
    expect(errors(credentialsSchema, { ...valid, password: "密码密码密码密" })).toEqual(["密码至少 8 位"])
    expect(errors(credentialsSchema, { ...valid, password: "😀".repeat(8) })).toEqual([])
    expect(errors(credentialsSchema, { ...valid, password: "😀".repeat(128) })).toEqual([])
    expect(errors(credentialsSchema, { ...valid, password: "a".repeat(129) })).toEqual(["密码最长 128 位"])
  })
})

describe("图集搜索", () => {
  it("缺省的条件都有默认值", () => {
    expect(gallerySearchSchema.parse({})).toEqual({ keyword: "", categories: [], cursor: "" })
  })

  it("关键词按 UTF-8 字节数限制在 200 以内", () => {
    expect(errors(gallerySearchSchema, { keyword: "a".repeat(200) })).toEqual([])
    /* 一个汉字 3 字节，67 个就是 201 字节，虽然 JS 的 length 只有 67 */
    expect(errors(gallerySearchSchema, { keyword: "汉".repeat(66) })).toEqual([])
    expect(errors(gallerySearchSchema, { keyword: "汉".repeat(67) })).toEqual(["关键词太长了"])
  })

  it("认不出的分类名与不是数字的游标被退回", () => {
    expect(errors(gallerySearchSchema, { categories: ["manga", "comic"] })).toEqual(["分类名不合法"])
    expect(errors(gallerySearchSchema, { cursor: "12a" })).toEqual(["分页游标不合法"])
    expect(errors(gallerySearchSchema, { site: "ex" })).toEqual(["站点不合法"])
  })
})

describe("e 站凭据", () => {
  it("member id 与 pass hash 不能为空，igneous 可以省略", () => {
    expect(ehCookieSchema.parse({ ipbMemberId: "1", ipbPassHash: "abc" })).toEqual({
      ipbMemberId: "1",
      ipbPassHash: "abc",
      igneous: "",
    })
    expect(errors(ehCookieSchema, { ipbMemberId: "", ipbPassHash: "abc" })).toEqual([
      "ipb_member_id 和 ipb_pass_hash 都不能为空",
    ])
  })

  it("会弄坏 Cookie 头的字符被挡掉", () => {
    for (const bad of ["a;b", "a b", 'a"b', "a,b", "a\\b", "中"]) {
      expect(errors(ehCookieSchema, { ipbMemberId: "1", ipbPassHash: bad })).toEqual([
        "Cookie 值里有不允许的字符，检查是不是多复制了分号、空格或引号",
      ])
    }
  })
})

describe("偏好与搜索历史", () => {
  it("自动翻页间隔是 1–20 的整数", () => {
    for (const readerInterval of [1, 20]) {
      expect(errors(galleryPreferencesSchema, { categories: [], readerInterval })).toEqual([])
    }
    for (const readerInterval of [0, 21, 1.5, "5"]) {
      expect(errors(galleryPreferencesSchema, { categories: [], readerInterval })).toEqual(["自动翻页间隔应为 1–20 秒"])
    }
  })

  it("搜索历史最多 10 条，每条 1–200 字节", () => {
    expect(errors(searchHistorySchema, { entries: Array.from({ length: 10 }, (_, i) => `词${i}`) })).toEqual([])
    expect(errors(searchHistorySchema, { entries: Array.from({ length: 11 }, (_, i) => `词${i}`) })).toEqual([
      "搜索历史最多 10 条",
    ])
    for (const entry of ["", "汉".repeat(67), null]) {
      expect(errors(searchHistorySchema, { entries: [entry] })).toEqual(["搜索历史关键词应为 1–200 字节"])
    }
  })
})

describe("阅读进度", () => {
  const valid = { gid: 2231376, token: "a7584a5932", page: 3, writer: "tab", seq: 1 }

  it("各字段的边界", () => {
    expect(errors(readingProgressSchema, valid)).toEqual([])
    expect(errors(readingProgressSchema, { ...valid, gid: 0 })).toEqual(["图集编号不合法"])
    expect(errors(readingProgressSchema, { ...valid, token: "A7584A5932" })).toEqual(["图集令牌不合法"])
    expect(errors(readingProgressSchema, { ...valid, page: 0 })).toEqual(["页码不合法"])
    expect(errors(readingProgressSchema, { ...valid, page: 2 ** 31 })).toEqual(["页码不合法"])
    expect(errors(readingProgressSchema, { ...valid, writer: "" })).toEqual(["上报方标识不合法"])
    expect(errors(readingProgressSchema, { ...valid, writer: "w".repeat(65) })).toEqual(["上报方标识不合法"])
    expect(errors(readingProgressSchema, { ...valid, seq: 0 })).toEqual(["上报序号不合法"])
  })
})

describe("节假日日期", () => {
  it("省略、空串与真实存在的日期都收", () => {
    for (const query of [{}, { date: "" }, { date: "2024-02-29" }, { date: "0050-01-01" }]) {
      expect(errors(holidayQuerySchema, query)).toEqual([])
    }
  })

  it("格式不对或日历上没有这天的都退回", () => {
    for (const date of ["2026-02-30", "2025-02-29", "2026-1-4", "2026-13-01", "20260101", "invalid"]) {
      expect(errors(holidayQuerySchema, { date })).toEqual(["日期格式错误，应为 YYYY-MM-DD"])
    }
  })
})
