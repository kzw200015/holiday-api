/* @vitest-environment happy-dom */
import { VueQueryPlugin, type QueryClient } from "@tanstack/vue-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, nextTick } from "vue"

import type * as EhApi from "@/api/eh"
import { fetchGalleryPreferences, saveGalleryCategories, saveReaderInterval } from "@/api/eh"
import { createQueryClient } from "@/api/queryClient"
import { useGalleryPreferences } from "@/composables/useGalleryPreferences"

vi.mock("@/api/eh", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryPreferences: vi.fn(),
  saveGalleryCategories: vi.fn(),
  saveReaderInterval: vi.fn(),
}))

/* 偏好是账号级的一份数据，同一份缓存下的每个页面读到的都是它，所以用例内共用一个 queryClient。 */
let queryClient: QueryClient
const apps: ReturnType<typeof createApp>[] = []

function createPreferences() {
  let api!: ReturnType<typeof useGalleryPreferences>
  const app = createApp({
    setup() {
      api = useGalleryPreferences()
      return () => null
    },
  })
  app.use(VueQueryPlugin, { queryClient })
  app.mount(document.createElement("div"))
  apps.push(app)
  return api
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

beforeEach(() => {
  vi.resetAllMocks()
  queryClient = createQueryClient()
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], readerInterval: 8 })
  vi.mocked(saveGalleryCategories).mockResolvedValue(null)
  vi.mocked(saveReaderInterval).mockResolvedValue(null)
})
afterEach(() => {
  for (const app of apps.splice(0)) {
    app.unmount()
  }
  queryClient.clear()
})

describe("账号浏览偏好", () => {
  it("从服务端读取，分类与间隔独立保存，空分类也提交", async () => {
    const preferences = createPreferences()
    await settle()
    expect(preferences.categories.value).toEqual(["manga"])
    expect(preferences.interval.value).toBe(8)
    await preferences.applyCategories([])
    expect(saveGalleryCategories).toHaveBeenCalledExactlyOnceWith([])
    expect(saveReaderInterval).not.toHaveBeenCalled()
    preferences.interval.value = 6
    await preferences.saveInterval()
    expect(saveReaderInterval).toHaveBeenCalledExactlyOnceWith(6)
    expect(preferences.categories.value).toEqual([])
  })

  it("重新进入时读取远端修改，不导入旧浏览器数据", async () => {
    localStorage.setItem("myapi.gallery-categories.1", '["misc"]')
    localStorage.setItem("myapi.reader-interval.1", "20")
    const preferences = createPreferences()
    await settle()
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
    await settle()
    expect(preferences.loading.value).toBe(false)
    expect(preferences.interval.value).toBe(5)
    expect(preferences.errorMessage.value).toContain("读取浏览偏好失败")
    await preferences.applyCategories(["manga"])
    /* 保存失败不把用户刚做的选择弹回去。 */
    expect(preferences.categories.value).toEqual(["manga"])
    expect(preferences.errorMessage.value).toContain("未同步到账号")
    expect(preferences.saving.value).toBe(false)
    preferences.interval.value = 7
    await preferences.saveInterval()
    expect(preferences.interval.value).toBe(7)
    /* 提示跟着最近一次保存走，不会被上一次分类保存的失败挡住。 */
    expect(preferences.errorMessage.value).toContain("翻页间隔保存失败")
    expect(preferences.saving.value).toBe(false)
    expect(saveReaderInterval).toHaveBeenCalledTimes(1)
  })

  /* 偏好只有一份：在阅读器里改了间隔，回到列表页不该看到一个过时的值。 */
  it("多个页面读同一份偏好，只请求一次，改动立刻互相可见", async () => {
    const list = createPreferences()
    const reader = createPreferences()
    await settle()
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(1)
    expect(list.interval.value).toBe(8)
    expect(reader.interval.value).toBe(8)
    reader.interval.value = 12
    await nextTick()
    expect(list.interval.value).toBe(12)
    await list.applyCategories(["misc"])
    expect(reader.categories.value).toEqual(["misc"])
  })
})
