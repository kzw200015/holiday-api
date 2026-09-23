/* @vitest-environment happy-dom */
import { createPinia, disposePinia, type Pinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, nextTick } from "vue"

import { useAuthStore } from "@/features/auth/store"
import type * as EhApi from "@/features/eh/api"
import { fetchGalleryDetail, saveProgress } from "@/features/eh/api"
import { useReadingProgress } from "@/features/eh/composables/useReadingProgress"
import type { GalleryDetail, GalleryDetailResult } from "@/features/eh/model"
import { useGalleryContentStore } from "@/features/eh/store"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryDetail: vi.fn(),
  saveProgress: vi.fn(),
}))

/* 与 useReadingProgress 里的 SAVE_DELAY 对齐。 */
const SAVE_DELAY = 1200

const gallery: GalleryDetail = {
  gid: 1,
  token: "aaaaaaaaaa",
  title: "测试图集",
  titleJpn: "",
  category: "Manga",
  thumbnail: "/thumbnail",
  uploader: "tester",
  postedAt: "2026-09-05T00:00:00Z",
  fileCount: 100,
  rating: 4,
  tags: [],
  fileSize: 100,
  torrentCount: 0,
  expunged: false,
}

let pinia: Pinia
const cleanups: (() => void)[] = []

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function detailResult(progress: number | null, gid = 1, token = "aaaaaaaaaa"): GalleryDetailResult {
  return { gallery: { ...gallery, gid, token }, progress, imageUrlTemplate: "/image/{page}" }
}

/* 详情已经读进来了，进度就是它的一个字段——翻页改的正是这一份。 */
async function seedDetail(gid: number, token: string, progress: number | null) {
  vi.mocked(fetchGalleryDetail).mockResolvedValueOnce(detailResult(progress, gid, token))
  await useGalleryContentStore(pinia).loadDetail(gid, token)
}

function progressOf(gid: number, token: string) {
  return useGalleryContentStore(pinia).detail(gid, token)?.data.value?.progress
}

async function mountReader() {
  let api!: ReturnType<typeof useReadingProgress>
  const app = createApp({
    setup() {
      api = useReadingProgress(1, "aaaaaaaaaa")
      return () => null
    },
  })
  app.use(pinia)
  app.mount(document.createElement("div"))
  cleanups.push(() => app.unmount())
  await nextTick()
  return { api }
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  pinia = createPinia()
  await seedDetail(1, "aaaaaaaaaa", 3)
  vi.mocked(saveProgress).mockResolvedValue(null)
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  disposePinia(pinia)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("阅读进度上报", () => {
  it("翻页当场改详情里的进度，连着翻只发最后一页", async () => {
    const { api } = await mountReader()
    api.report(5)
    /* 详情页的「继续阅读第 N 页」读的就是这里，所以不必等网络。 */
    expect(progressOf(1, "aaaaaaaaaa")).toBe(5)
    api.report(6)
    api.report(7)
    expect(progressOf(1, "aaaaaaaaaa")).toBe(7)
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

  it("存不上不回退，详情里仍是用户读到的那一页", async () => {
    vi.mocked(saveProgress).mockRejectedValue(new Error("断网"))
    const { api } = await mountReader()
    api.report(20)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    await nextTick()
    expect(progressOf(1, "aaaaaaaaaa")).toBe(20)
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
    const { api } = await mountReader()
    api.report(12)
    cleanups.pop()!()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "aaaaaaaaaa", 12)
  })

  /* 令牌失效时先退出再跳登录页：离开阅读器那次补提交排进的已经是新账号的队，不能再发。 */
  it("换了本站账号，这个阅读器攒着的和之后的页码都不再上报", async () => {
    const { api } = await mountReader()
    api.report(12)
    useAuthStore(pinia).logout()
    api.flush()
    api.report(13)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    cleanups.pop()!()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveProgress).not.toHaveBeenCalled()
  })
})

/* 本地那份才是用户正在用的：重取期间本地改过的进度，不能被请求发出那一刻的服务端快照盖回去。 */
describe("详情重取与本地进度", () => {
  it("重取在途时翻了页，响应回来仍是刚翻到的那页；之后的重取照常用服务端的", async () => {
    const refetch = deferred<GalleryDetailResult>()
    vi.mocked(fetchGalleryDetail).mockReturnValueOnce(refetch.promise)
    const content = useGalleryContentStore(pinia)
    const reload = content.reloadDetail(1, "aaaaaaaaaa")
    const { api } = await mountReader()
    api.report(15)
    refetch.resolve(detailResult(3))
    await reload
    expect(progressOf(1, "aaaaaaaaaa")).toBe(15)

    vi.mocked(fetchGalleryDetail).mockResolvedValueOnce(detailResult(20))
    await content.reloadDetail(1, "aaaaaaaaaa")
    expect(progressOf(1, "aaaaaaaaaa")).toBe(20)
  })

  it("详情还没到手时删掉了记录，迟到的详情不带回旧进度", async () => {
    const first = deferred<GalleryDetailResult>()
    vi.mocked(fetchGalleryDetail).mockReturnValueOnce(first.promise)
    const content = useGalleryContentStore(pinia)
    const load = content.loadDetail(2, "bbbbbbbbbb")
    content.forgetProgress(2, "bbbbbbbbbb")
    first.resolve(detailResult(17, 2, "bbbbbbbbbb"))
    await load
    expect(progressOf(2, "bbbbbbbbbb")).toBeNull()
  })

  it("重取在途时清空了历史，响应回来进度仍是空的", async () => {
    const refetch = deferred<GalleryDetailResult>()
    vi.mocked(fetchGalleryDetail).mockReturnValueOnce(refetch.promise)
    const content = useGalleryContentStore(pinia)
    const reload = content.reloadDetail(1, "aaaaaaaaaa")
    content.forgetAllProgress()
    refetch.resolve(detailResult(3))
    await reload
    expect(progressOf(1, "aaaaaaaaaa")).toBeNull()
  })
})
