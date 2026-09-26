/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import type * as EhApi from "@/features/eh/api"
import { fetchGalleryPreferences, patchGalleryPreferences } from "@/features/eh/api"
import { useGalleryPreferences } from "@/features/eh/composables/useGalleryPreferences"
import { composableTests, deferred, settleFakeTimers } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryPreferences: vi.fn(),
  patchGalleryPreferences: vi.fn(),
}))

const t = composableTests()
const mount = () => t.mount(useGalleryPreferences)

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], minRating: null, readerInterval: 8 })
  vi.mocked(patchGalleryPreferences).mockResolvedValue(null)
})
afterEach(() => {
  vi.useRealTimers()
})

describe("账号浏览偏好", () => {
  /* 读到之前 ready 为假，界面照这个显示骨架屏，而不是拿默认值冒充用户的设置。 */
  it("读到之前不就绪，多处同时要也只读一次", async () => {
    const preferences = mount()
    expect(preferences.ready.value).toBe(false)
    /* 另一个页面同时用到，复用在途的那次。 */
    const reader = mount()
    await settleFakeTimers()
    expect(preferences.ready.value).toBe(true)
    expect(preferences.filters.value).toEqual({ categories: ["manga"], minRating: null })
    expect(reader.interval.value).toBe(8)
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(1)
  })

  /* 偏好只有一份：在阅读器里改了间隔，回到列表页不该看到一个过时的值。 */
  it("改动当场生效、跨页面可见；只提交改了的字段，按操作顺序依次发出", async () => {
    const list = mount()
    const reader = mount()
    await settleFakeTimers()
    const first = deferred<null>()
    vi.mocked(patchGalleryPreferences).mockReturnValueOnce(first.promise)
    reader.interval.value = 12
    expect(list.interval.value).toBe(12)
    list.applyFilters({ categories: ["misc", "cosplay", "misc"], minRating: 4 })
    expect(reader.filters.value).toEqual({ categories: ["cosplay", "misc"], minRating: 4 })
    await settleFakeTimers()
    /* 前一次没回来，后一次不发：同一字段先后两次改动乱序到达就会旧盖新。 */
    expect(patchGalleryPreferences).toHaveBeenCalledExactlyOnceWith({ readerInterval: 12 })
    first.resolve(null)
    await settleFakeTimers()
    expect(patchGalleryPreferences).toHaveBeenLastCalledWith({ categories: ["cosplay", "misc"], minRating: 4 })
  })

  it("存不上就重读一次，以服务端为准", async () => {
    const preferences = mount()
    await settleFakeTimers()
    vi.mocked(patchGalleryPreferences).mockRejectedValueOnce(new Error("断网"))
    preferences.interval.value = 3
    expect(preferences.interval.value).toBe(3)
    await settleFakeTimers()
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(2)
    expect(preferences.interval.value).toBe(8)
  })

  /* 读回来的是服务端那一刻的样子：保存还没到就去读，会把刚改的按回去。 */
  it("有保存在途时，重读等它落地再发", async () => {
    const preferences = mount()
    await settleFakeTimers()
    const saving = deferred<null>()
    vi.mocked(patchGalleryPreferences).mockReturnValueOnce(saving.promise)
    preferences.interval.value = 15
    await settleFakeTimers()
    preferences.reload()
    await settleFakeTimers()
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(1)
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], minRating: null, readerInterval: 15 })
    saving.resolve(null)
    await settleFakeTimers()
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(2)
    expect(preferences.interval.value).toBe(15)
  })

  it("读失败不算就绪，重试读到后恢复正常", async () => {
    vi.mocked(fetchGalleryPreferences).mockRejectedValueOnce(new Error("断网"))
    const preferences = mount()
    await settleFakeTimers()
    expect(preferences.ready.value).toBe(false)
    expect(preferences.loadError.value).toBe("断网")

    preferences.reload()
    await settleFakeTimers()
    expect(preferences.ready.value).toBe(true)
    expect(preferences.loadError.value).toBe("")
  })

  /* 换账号那一刻作废：旧账号还没回来的读取，不能落到新账号头上。 */
  it("换账号后旧账号在途的读取作废，新页面读新账号的那份", async () => {
    const loading = deferred<EhApi.GalleryPreferences>()
    vi.mocked(fetchGalleryPreferences).mockReturnValueOnce(loading.promise)
    const before = mount()
    await settleFakeTimers()
    useAuthStore(t.pinia).logout()
    loading.resolve({ categories: ["cosplay"], minRating: null, readerInterval: 9 })
    await settleFakeTimers()
    expect(before.ready.value).toBe(false)

    const after = mount()
    await settleFakeTimers()
    expect(after.filters.value.categories).toEqual(["manga"])
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(2)
  })

  /* 旧页面卸载时会给它用的条目排一个回收定时器，回收按 key 删：不先解开，到点就把新账号同 key 的那份删了。 */
  it("换账号几分钟后，新账号的偏好不会被旧页面排下的回收删掉", async () => {
    const before = mount()
    await settleFakeTimers()
    expect(before.ready.value).toBe(true)
    useAuthStore(t.pinia).logout()
    t.unmount(before)

    const after = mount()
    await settleFakeTimers()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    after.interval.value = 11
    expect(after.interval.value).toBe(11)
  })

  /* 排队中的保存要等前一次回来才发，那时令牌已经是新账号的了，发出去就写到了新账号上。 */
  it("换账号后旧账号排队中的保存不再发出", async () => {
    const saving = deferred<null>()
    vi.mocked(patchGalleryPreferences).mockReturnValueOnce(saving.promise)
    const preferences = mount()
    await settleFakeTimers()
    preferences.interval.value = 6
    preferences.interval.value = 7
    await settleFakeTimers()
    expect(patchGalleryPreferences).toHaveBeenCalledExactlyOnceWith({ readerInterval: 6 })

    useAuthStore(t.pinia).logout()
    saving.resolve(null)
    await settleFakeTimers()
    expect(patchGalleryPreferences).toHaveBeenCalledTimes(1)
  })
})
