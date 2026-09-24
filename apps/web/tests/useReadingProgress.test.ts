/* @vitest-environment happy-dom */
import type { ReadingProgress } from "@myapi/shared/eh"
import { useQueryCache } from "@pinia/colada"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

import { useAuthStore } from "@/features/auth/store"
import type * as EhApi from "@/features/eh/api"
import { fetchReadingProgress, saveProgress } from "@/features/eh/api"
import { useGalleryProgress } from "@/features/eh/composables/useGalleryProgress"
import { useReadingProgress } from "@/features/eh/composables/useReadingProgress"
import { ehKeys } from "@/features/eh/queries"
import { composableTests, deferred } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchReadingProgress: vi.fn(),
  saveProgress: vi.fn(),
}))

/* 与 useReadingProgress 里的 SAVE_DELAY 对齐。 */
const SAVE_DELAY = 1200

const t = composableTests()

function progressOf(gid: number) {
  return useQueryCache(t.pinia).getQueryData(ehKeys.progress(gid))
}

/* 阅读器上报进度，旁边再挂一个读这本进度的（详情页那份），用来看两边怎么交错。 */
async function mountReader() {
  const result = t.mount(() => ({
    api: useReadingProgress(1, "aaaaaaaaaa"),
    reading: useGalleryProgress(1),
  }))
  await vi.advanceTimersByTimeAsync(0)
  return result
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.mocked(fetchReadingProgress).mockResolvedValue({ page: 3 })
  vi.mocked(saveProgress).mockResolvedValue(null)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("阅读进度上报", () => {
  it("翻页当场改本地的进度，连着翻只发最后一页", async () => {
    const { api, reading } = await mountReader()
    expect(reading.progress.value).toBe(3)
    api.report(5)
    /* 详情页的「继续阅读第 N 页」读的就是这里，所以不必等网络。 */
    expect(reading.progress.value).toBe(5)
    api.report(6)
    api.report(7)
    expect(progressOf(1)).toBe(7)
    expect(saveProgress).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "aaaaaaaaaa", 7)
  })

  /* 乱序到达由服务端按上报序号挡住。要是等前一次回来，页面卸载时补发的那次就发不出去了：前一次回来时页面已经没了。 */
  it("前一次还没回来，页面收起时那次也当场发出", async () => {
    vi.mocked(saveProgress).mockReturnValueOnce(new Promise(() => {}))
    const { api } = await mountReader()
    api.report(5)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    expect(saveProgress).toHaveBeenCalledTimes(1)

    api.report(9)
    window.dispatchEvent(new Event("pagehide"))
    /* 不推进时间：卸载中的页面等不到前一次的响应。 */
    expect(saveProgress).toHaveBeenLastCalledWith(1, "aaaaaaaaaa", 9)
  })

  it("flush 把合并窗口里那次立刻发出去", async () => {
    const { api } = await mountReader()
    api.report(12)
    expect(saveProgress).not.toHaveBeenCalled()
    api.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "aaaaaaaaaa", 12)
    /* 已经发过了，原定的那次不会再来一遍。 */
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    expect(saveProgress).toHaveBeenCalledTimes(1)
  })

  it("存不上不回退，本地仍是用户读到的那一页", async () => {
    vi.mocked(saveProgress).mockRejectedValue(new Error("断网"))
    const { api } = await mountReader()
    api.report(20)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    await nextTick()
    expect(progressOf(1)).toBe(20)
  })

  /* 一秒一页的自动翻页比合并窗口还短：窗口从第一次上报起算，不能被后面的翻页一直往后推。 */
  it("连续翻页期间也按窗口定期上报", async () => {
    const { api } = await mountReader()
    api.report(5)
    await vi.advanceTimersByTimeAsync(1000)
    api.report(6)
    await vi.advanceTimersByTimeAsync(1000)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "aaaaaaaaaa", 6)
    api.report(7)
    await vi.advanceTimersByTimeAsync(1000)
    api.report(8)
    await vi.advanceTimersByTimeAsync(1000)
    expect(saveProgress).toHaveBeenCalledTimes(2)
    expect(saveProgress).toHaveBeenLastCalledWith(1, "aaaaaaaaaa", 8)
  })

  /* 刷新、关标签页、移动端切走后被系统回收，都不会再有离开路由那一步。 */
  it("页面切到后台或被收起时把攒着的发出去", async () => {
    const { api } = await mountReader()
    api.report(12)
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(0)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "aaaaaaaaaa", 12)
    visibility.mockReturnValue("visible")
    api.report(13)
    window.dispatchEvent(new Event("pagehide"))
    await vi.advanceTimersByTimeAsync(0)
    expect(saveProgress).toHaveBeenLastCalledWith(1, "aaaaaaaaaa", 13)
  })

  it("卸载时把还没发出的那次补上", async () => {
    const reader = await mountReader()
    reader.api.report(12)
    t.unmount(reader)
    await vi.advanceTimersByTimeAsync(0)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "aaaaaaaaaa", 12)
  })

  /* 令牌失效时先退出再跳登录页：离开阅读器那次补提交带的已经是新账号的令牌，不能再发。 */
  it("换了本站账号，这个阅读器攒着的和之后的页码都不再上报", async () => {
    const reader = await mountReader()
    reader.api.report(12)
    useAuthStore(t.pinia).logout()
    reader.api.flush()
    reader.api.report(13)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    t.unmount(reader)
    await vi.advanceTimersByTimeAsync(0)
    expect(saveProgress).not.toHaveBeenCalled()
  })
})

/* 本地那份才是用户正在用的：读进度与上报交错时，不能被读取发出那一刻的服务端快照盖回去。 */
describe("重读进度与本地上报", () => {
  it("重读在途时翻了页，响应回来仍是刚翻到的那页；之后的重读照常用服务端的", async () => {
    const { api, reading } = await mountReader()
    const refetch = deferred<ReadingProgress>()
    vi.mocked(fetchReadingProgress).mockReturnValueOnce(refetch.promise)
    void reading.reload()
    await vi.advanceTimersByTimeAsync(0)
    api.report(15)
    refetch.resolve({ page: 3 })
    await vi.advanceTimersByTimeAsync(0)
    expect(reading.progress.value).toBe(15)

    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    vi.mocked(fetchReadingProgress).mockResolvedValueOnce({ page: 20 })
    await reading.reload()
    expect(reading.progress.value).toBe(20)
  })

  /* 刚退出阅读就去读，上报还在路上：读回来的会是上报之前的页码。 */
  it("有上报在途时，读进度等它落地再发", async () => {
    const { api, reading } = await mountReader()
    const saving = deferred<null>()
    vi.mocked(saveProgress).mockReturnValueOnce(saving.promise)
    api.report(30)
    api.flush()
    vi.mocked(fetchReadingProgress).mockClear().mockResolvedValue({ page: 30 })
    void reading.reload()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchReadingProgress).not.toHaveBeenCalled()
    saving.resolve(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchReadingProgress).toHaveBeenCalledTimes(1)
    expect(reading.progress.value).toBe(30)
  })
})
