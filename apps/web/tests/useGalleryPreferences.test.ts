/* @vitest-environment happy-dom */
import { createPinia, disposePinia, type Pinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, nextTick } from "vue"

import { useAuthStore } from "@/features/auth/store"
import type * as EhApi from "@/features/eh/api"
import { fetchGalleryPreferences, saveGalleryPreferences } from "@/features/eh/api"
import { useGalleryPreferences } from "@/features/eh/composables/useGalleryPreferences"
import type { GalleryPreferences } from "@/features/eh/model"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryPreferences: vi.fn(),
  saveGalleryPreferences: vi.fn(),
}))

/* 账号级的一份数据，每个页面读到的都是同一份，所以用例内的几个应用共用一个 pinia。 */
let pinia: Pinia
const apps: ReturnType<typeof createApp>[] = []

function mount() {
  let api!: ReturnType<typeof useGalleryPreferences>
  const app = createApp({
    setup() {
      api = useGalleryPreferences()
      return () => null
    },
  })
  app.use(pinia)
  app.mount(document.createElement("div"))
  apps.push(app)
  return api
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  pinia = createPinia()
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], readerInterval: 8 })
  vi.mocked(saveGalleryPreferences).mockResolvedValue(null)
})
afterEach(() => {
  for (const app of apps.splice(0)) {
    app.unmount()
  }
  disposePinia(pinia)
  vi.useRealTimers()
})

describe("账号浏览偏好", () => {
  /* 读到之前 ready 为假，界面照这个显示骨架屏，而不是拿默认值冒充用户的设置。 */
  it("读到之前不就绪，多处同时要也只读一次", async () => {
    const preferences = mount()
    expect(preferences.ready.value).toBe(false)
    /* 另一个页面同时用到，不该再读一遍。 */
    const reader = mount()
    await settle()
    expect(preferences.ready.value).toBe(true)
    expect(preferences.categories.value).toEqual(["manga"])
    expect(reader.interval.value).toBe(8)
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(1)
  })

  /* 偏好只有一份：在阅读器里改了间隔，回到列表页不该看到一个过时的值。 */
  it("改动当场生效、跨页面可见；连着改就按顺序提交两次", async () => {
    const list = mount()
    const reader = mount()
    await settle()
    reader.interval.value = 12
    expect(list.interval.value).toBe(12)
    list.applyCategories(["misc"])
    expect(reader.categories.value).toEqual(["misc"])
    await settle()
    await settle()
    /* 不做合并：改几次就提交几次，scope 保证它们按操作顺序到达。 */
    expect(saveGalleryPreferences).toHaveBeenCalledTimes(2)
    expect(saveGalleryPreferences).toHaveBeenNthCalledWith(1, { categories: ["manga"], readerInterval: 12 })
    expect(saveGalleryPreferences).toHaveBeenNthCalledWith(2, { categories: ["misc"], readerInterval: 12 })
  })

  it("推送失败不回滚本地，也不打断用户", async () => {
    vi.mocked(saveGalleryPreferences).mockRejectedValue(new Error("断网"))
    const preferences = mount()
    await settle()
    preferences.interval.value = 3
    await settle()
    expect(preferences.interval.value).toBe(3)
    /* 失败不会自己重来；下一次改动会把最新的整份再推一遍。 */
    expect(saveGalleryPreferences).toHaveBeenCalledTimes(1)
    preferences.interval.value = 4
    await settle()
    expect(saveGalleryPreferences).toHaveBeenLastCalledWith({ categories: ["manga"], readerInterval: 4 })
  })

  /* 保存是整份提交：拿没读到的占位值去存，会把服务端原有的偏好冲掉。 */
  it("读失败不算就绪，也不拿占位值去保存；重试读到后恢复正常", async () => {
    vi.mocked(fetchGalleryPreferences).mockRejectedValueOnce(new Error("断网"))
    const preferences = mount()
    await settle()
    expect(preferences.ready.value).toBe(false)
    expect(preferences.loadError.value).toBe("断网")
    preferences.interval.value = 9
    preferences.applyCategories(["manga"])
    await settle()
    expect(saveGalleryPreferences).not.toHaveBeenCalled()

    preferences.reload()
    await settle()
    expect(preferences.ready.value).toBe(true)
    expect(preferences.loadError.value).toBe("")
  })

  /* 换账号那一刻作废：旧账号还没回来的读取，不能落到新账号头上。 */
  it("换账号后旧账号在途的读取作废，新页面读新账号的那份", async () => {
    let finish!: (value: GalleryPreferences) => void
    vi.mocked(fetchGalleryPreferences).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const before = mount()
    await settle()
    useAuthStore(pinia).logout()
    finish({ categories: ["旧账号的分类"], readerInterval: 9 })
    await settle()
    expect(before.ready.value).toBe(false)

    const after = mount()
    await settle()
    expect(after.categories.value).toEqual(["manga"])
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(2)
  })

  /* 排队中的保存要等前一次回来才发，那时令牌已经是新账号的了，发出去就写到了新账号上。 */
  it("换账号后旧账号排队中的保存不再发出", async () => {
    let finish!: (value: null) => void
    vi.mocked(saveGalleryPreferences).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const preferences = mount()
    await settle()
    preferences.interval.value = 6
    preferences.interval.value = 7
    await settle()
    expect(saveGalleryPreferences).toHaveBeenCalledExactlyOnceWith({ categories: ["manga"], readerInterval: 6 })

    useAuthStore(pinia).logout()
    finish(null)
    await settle()
    expect(saveGalleryPreferences).toHaveBeenCalledTimes(1)
  })
})
