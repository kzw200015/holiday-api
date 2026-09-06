// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useGalleryCategories } from "@/composables/useGalleryCategories"

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("分类偏好", () => {
  it("按账号保存已应用的分类，空选择也覆盖之前的偏好", () => {
    const categories = useGalleryCategories(1)
    categories.apply(["manga", "doujinshi", "manga", "unknown"])
    expect(useGalleryCategories(1).selected.value).toEqual(["doujinshi", "manga"])
    expect(useGalleryCategories(2).selected.value).toEqual([])
    categories.apply([])
    expect(useGalleryCategories(1).selected.value).toEqual([])
  })

  it("读取时过滤未知分类，损坏或不可用的存储不影响筛选", () => {
    localStorage.setItem("myapi.gallery-categories.1", '[null, "manga", "manga", "old"]')
    expect(useGalleryCategories(1).selected.value).toEqual(["manga"])
    localStorage.setItem("myapi.gallery-categories.1", "not json")
    expect(useGalleryCategories(1).selected.value).toEqual([])
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("不可读")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("不可写")
    })
    const categories = useGalleryCategories(1)
    expect(() => categories.apply(["manga"])).not.toThrow()
    expect(categories.selected.value).toEqual(["manga"])
  })
})
