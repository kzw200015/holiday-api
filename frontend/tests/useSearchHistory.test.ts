// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSearchHistory } from "@/composables/useSearchHistory"

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe("搜索历史", () => {
  it("只保留十个非空关键词，重复提交置顶并按账号持久化", () => {
    const history = useSearchHistory(1)
    history.record("   ")
    for (let index = 0; index < 12; index++) history.record(`词${index}`)
    history.record(" 词5 ")
    expect(history.entries.value).toHaveLength(10)
    expect(history.entries.value[0]).toBe("词5")
    expect(history.entries.value).not.toContain("词0")
    expect(useSearchHistory(1).entries.value).toEqual(history.entries.value)
    expect(useSearchHistory(2).entries.value).toEqual([])
    history.remove("词5")
    expect(useSearchHistory(1).entries.value).not.toContain("词5")
    history.clear()
    expect(useSearchHistory(1).entries.value).toEqual([])
  })

  it("损坏或不可用的存储不阻断搜索", () => {
    localStorage.setItem("myapi.search-history.1", "not json")
    expect(useSearchHistory(1).entries.value).toEqual([])
    localStorage.setItem("myapi.search-history.1", '[null, 1, "a", "a", ""]')
    expect(useSearchHistory(1).entries.value).toEqual(["a"])
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("不可写") })
    const history = useSearchHistory(1)
    expect(() => history.record("b")).not.toThrow()
    expect(history.entries.value).toEqual(["b", "a"])
  })
})
