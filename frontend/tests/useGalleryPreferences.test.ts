/* @vitest-environment happy-dom */
import { createPinia, disposePinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope } from "vue"

import { fetchGalleryPreferences, saveGalleryCategories, saveReaderInterval } from "@/api/eh"
import { useGalleryPreferences } from "@/composables/useGalleryPreferences"

vi.mock("@/api/eh", () => ({
  fetchGalleryPreferences: vi.fn(),
  saveGalleryCategories: vi.fn(),
  saveReaderInterval: vi.fn(),
}))

/* 偏好数据住在账号 Store 里，页面拿到的是同一份，所以每个用例都要一个干净的 Pinia。 */
let pinia: ReturnType<typeof createPinia>

const scopes: ReturnType<typeof effectScope>[] = []
function createPreferences() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(useGalleryPreferences)!
}

beforeEach(() => {
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], readerInterval: 8 })
  vi.mocked(saveGalleryCategories).mockResolvedValue(null)
  vi.mocked(saveReaderInterval).mockResolvedValue(null)
})
afterEach(() => {
  for (const scope of scopes.splice(0)) {
    scope.stop()
  }
  disposePinia(pinia)
})

describe("账号浏览偏好", () => {
  it("从服务端读取，分类与间隔独立保存，空分类也提交", async () => {
    const preferences = createPreferences()
    await preferences.load()
    expect(preferences.categories.value).toEqual(["manga"])
    expect(preferences.interval.value).toBe(8)
    await preferences.applyCategories([])
    expect(saveGalleryCategories).toHaveBeenCalledExactlyOnceWith([], expect.any(AbortSignal))
    expect(saveReaderInterval).not.toHaveBeenCalled()
    preferences.interval.value = 6
    await preferences.saveInterval()
    expect(saveReaderInterval).toHaveBeenCalledExactlyOnceWith(6, expect.any(AbortSignal))
    expect(preferences.categories.value).toEqual([])
  })

  it("重新进入时读取远端修改，不导入旧浏览器数据", async () => {
    localStorage.setItem("myapi.gallery-categories.1", '["misc"]')
    localStorage.setItem("myapi.reader-interval.1", "20")
    const preferences = createPreferences()
    await preferences.load()
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], readerInterval: 3 })
    await preferences.load()
    expect(preferences.categories.value).toEqual([])
    expect(preferences.interval.value).toBe(3)
    expect(saveGalleryCategories).not.toHaveBeenCalled()
    expect(saveReaderInterval).not.toHaveBeenCalled()
    localStorage.clear()
  })

  it("读取失败仍可使用默认值；保存失败明确提示，不自动重试", async () => {
    vi.mocked(fetchGalleryPreferences).mockRejectedValue(new Error("断网"))
    vi.mocked(saveGalleryCategories).mockRejectedValue(new Error("断网"))
    vi.mocked(saveReaderInterval).mockRejectedValue(new Error("断网"))
    const preferences = createPreferences()
    await preferences.load()
    expect(preferences.loading.value).toBe(false)
    expect(preferences.interval.value).toBe(5)
    expect(preferences.errorMessage.value).toContain("读取浏览偏好失败")
    await preferences.applyCategories(["manga"])
    expect(preferences.categories.value).toEqual(["manga"])
    expect(preferences.errorMessage.value).toContain("未同步到账号")
    expect(preferences.saving.value).toBe(false)
    preferences.interval.value = 7
    await preferences.saveInterval()
    expect(preferences.interval.value).toBe(7)
    expect(preferences.errorMessage.value).toContain("翻页间隔保存失败")
    expect(preferences.saving.value).toBe(false)
    expect(saveReaderInterval).toHaveBeenCalledTimes(1)
  })

  it("卸载后取消读取，迟到响应不更新旧页面", async () => {
    let resolve!: (value: { categories: string[]; readerInterval: number }) => void
    vi.mocked(fetchGalleryPreferences).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const preferences = createPreferences()
    const request = preferences.load()
    /* 读取经过账号 Store 的队列，排到队头要等一个微任务。 */
    await Promise.resolve()
    scopes.at(-1)!.stop()
    expect(vi.mocked(fetchGalleryPreferences).mock.calls[0]![0]!.aborted).toBe(true)
    resolve({ categories: ["manga"], readerInterval: 10 })
    await request
    expect(preferences.categories.value).toEqual([])
    expect(preferences.interval.value).toBe(5)
  })
})
