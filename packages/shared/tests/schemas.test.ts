import { describe, expect, it } from "vitest"
import type { z } from "zod"

import { readerIntervalSchema, recordSearchKeyword, searchHistoryEntrySchema } from "../src/eh"

/* 失败时给出的全部文案；通过时为空数组。 */
function errors(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe("偏好与搜索历史", () => {
  it("自动翻页间隔是 1–20 的整数", () => {
    for (const readerInterval of [1, 20]) {
      expect(errors(readerIntervalSchema, readerInterval)).toEqual([])
    }
    for (const readerInterval of [0, 21, 1.5, "5"]) {
      expect(errors(readerIntervalSchema, readerInterval)).toEqual(["自动翻页间隔应为 1–20 秒"])
    }
  })

  it("搜索历史的一个词 1–200 字节", () => {
    expect(errors(searchHistoryEntrySchema, "猫")).toEqual([])
    /* 一个汉字 3 字节，66 个是 198 字节，67 个就是 201 字节，虽然 JS 的 length 只有 67 */
    expect(errors(searchHistoryEntrySchema, "汉".repeat(66))).toEqual([])
    for (const keyword of ["", "汉".repeat(67), null]) {
      expect(errors(searchHistoryEntrySchema, keyword)).toEqual(["搜索历史关键词应为 1–200 字节"])
    }
  })

  it("记一个词：排最前、同一个词只留一条、最多 10 条", () => {
    expect(recordSearchKeyword(["b", "a"], "a")).toEqual(["a", "b"])
    const full = Array.from({ length: 10 }, (_, i) => `词${i}`)
    expect(recordSearchKeyword(full, "新")).toEqual(["新", ...full.slice(0, 9)])
  })
})
