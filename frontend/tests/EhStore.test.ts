/* @vitest-environment happy-dom */
import { createPinia, disposePinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import type * as EhApi from "@/features/eh/api"
import {
  clearReadingHistory,
  clearSearchHistory,
  fetchGalleryDetail,
  fetchReadingHistory,
  fetchSearchHistory,
  recordSearch,
  removeReadingHistory,
  removeSearch,
  saveProgress,
} from "@/features/eh/api"
import type { GalleryDetail } from "@/features/eh/model"
import { useEhStore } from "@/features/eh/store"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryDetail: vi.fn(),
  fetchReadingHistory: vi.fn(),
  saveProgress: vi.fn(),
  fetchSearchHistory: vi.fn(),
  recordSearch: vi.fn(),
  removeSearch: vi.fn(),
  clearSearchHistory: vi.fn(),
  removeReadingHistory: vi.fn(),
  clearReadingHistory: vi.fn(),
}))

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
const detail = { gallery, progress: 3, imageUrlTemplate: "/image/{page}" }
const position = { gid: gallery.gid, token: gallery.token, page: 7 }
let pinia: ReturnType<typeof createPinia>
let store: ReturnType<typeof useEhStore>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = { id: 1, username: "first" }
  store = useEhStore()
  vi.mocked(fetchGalleryDetail).mockResolvedValue(detail)
  vi.mocked(fetchReadingHistory).mockResolvedValue({
    items: [{ ...position, readAt: gallery.postedAt, gallery }],
    nextCursor: null,
  })
  vi.mocked(saveProgress).mockResolvedValue(null)
  vi.mocked(removeReadingHistory).mockResolvedValue(null)
  vi.mocked(clearReadingHistory).mockResolvedValue(null)
})

afterEach(() => {
  disposePinia(pinia)
  vi.useRealTimers()
})

describe("EH 共享阅读状态", () => {
  it("历史原样返回含页码的记录，同一份进度状态跟着刷新；删除和清空直接更新共享状态", async () => {
    const loadedDetail = await store.loadGalleryDetail(1, gallery.token)
    expect(loadedDetail).toEqual({ gallery, imageUrlTemplate: detail.imageUrlTemplate })
    expect(store.readingProgress.get(1)).toBe(3)
    const history = await store.loadReadingHistory("")
    expect(history.items[0]).toEqual({ gid: 1, token: gallery.token, page: 7, readAt: gallery.postedAt, gallery })
    expect(store.readingProgress.get(1)).toBe(7)
    await store.removeReadingHistory(1)
    expect(store.readingProgress.has(1)).toBe(false)
    await store.loadGalleryDetail(1, gallery.token)
    await store.clearReadingHistory()
    expect(store.readingProgress.size).toBe(0)
  })

  it("同一本防抖合并到最后位置，不同图集分别保留任务；成功前不冒充已保存", async () => {
    await store.loadGalleryDetail(1, gallery.token)
    store.scheduleProgress(position)
    await vi.advanceTimersByTimeAsync(500)
    store.scheduleProgress({ ...position, page: 8 })
    store.scheduleProgress({ gid: 2, token: "bbbbbbbbbb", page: 2 })
    await vi.advanceTimersByTimeAsync(1199)
    expect(saveProgress).not.toHaveBeenCalled()
    expect(store.readingProgress.get(1)).toBe(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(saveProgress).toHaveBeenCalledTimes(2)
    expect(store.readingProgress.get(1)).toBe(8)
    expect(store.readingProgress.get(2)).toBe(2)
  })

  it("已开始的保存、历史查询和删除串行执行，旧保存不能在删除之后重新写回", async () => {
    const saving = deferred<null>()
    vi.mocked(saveProgress).mockReturnValueOnce(saving.promise)
    store.scheduleProgress(position)
    await vi.advanceTimersByTimeAsync(1200)
    const history = store.loadReadingHistory("")
    const removing = store.removeReadingHistory(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchReadingHistory).not.toHaveBeenCalled()
    expect(removeReadingHistory).not.toHaveBeenCalled()
    saving.resolve(null)
    await history
    await removing
    expect(fetchReadingHistory).toHaveBeenCalledTimes(1)
    expect(removeReadingHistory).toHaveBeenCalledExactlyOnceWith(1, expect.any(AbortSignal))
    expect(store.readingProgress.has(1)).toBe(false)
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.readingProgress.has(1)).toBe(false)
    expect(saveProgress).toHaveBeenCalledTimes(1)
  })

  it("删除取消该图集未触发的保存，清空取消所有图集的待保存任务", async () => {
    store.scheduleProgress(position)
    store.scheduleProgress({ gid: 2, token: "bbbbbbbbbb", page: 2 })
    await store.removeReadingHistory(1)
    await vi.advanceTimersByTimeAsync(1200)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(2, "bbbbbbbbbb", 2, expect.any(AbortSignal))
    expect(store.readingProgress.has(1)).toBe(false)
    store.scheduleProgress(position)
    store.scheduleProgress({ gid: 2, token: "bbbbbbbbbb", page: 3 })
    await store.clearReadingHistory()
    await vi.advanceTimersByTimeAsync(1200)
    expect(saveProgress).toHaveBeenCalledTimes(1)
    expect(store.readingProgress.size).toBe(0)
  })

  it("保存或删除失败保留已确认进度，队列继续处理后续操作", async () => {
    await store.loadGalleryDetail(1, gallery.token)
    vi.mocked(saveProgress).mockRejectedValueOnce(new Error("保存失败"))
    store.scheduleProgress(position)
    await vi.advanceTimersByTimeAsync(1200)
    expect(store.readingProgress.get(1)).toBe(3)
    vi.mocked(removeReadingHistory).mockRejectedValueOnce(new Error("删除失败"))
    await expect(store.removeReadingHistory(1)).rejects.toThrow("删除失败")
    expect(store.readingProgress.get(1)).toBe(3)
    await store.clearReadingHistory()
    expect(store.readingProgress.size).toBe(0)
  })

  it("排队中取消的页面查询不会发请求，也不会更改已保存进度", async () => {
    const saving = deferred<null>()
    vi.mocked(saveProgress).mockReturnValueOnce(saving.promise)
    store.scheduleProgress(position)
    await vi.advanceTimersByTimeAsync(1200)
    const controller = new AbortController()
    const history = store.loadReadingHistory("", controller.signal)
    const canceled = history.catch((error: unknown) => error)
    controller.abort()
    saving.resolve(null)
    expect(await canceled).toMatchObject({ name: "AbortError" })
    expect(fetchReadingHistory).not.toHaveBeenCalled()
    expect(store.readingProgress.get(1)).toBe(7)
  })

  it("切换账号取消旧请求、排队操作和计时器，新会话不等待旧响应且不接收旧数据", async () => {
    const pending = deferred<typeof detail>()
    vi.mocked(fetchGalleryDetail).mockReturnValueOnce(pending.promise)
    const oldDetail = store.loadGalleryDetail(1, gallery.token)
    const canceled = oldDetail.catch((error: unknown) => error)
    store.scheduleProgress(position)
    await vi.advanceTimersByTimeAsync(1200)
    const oldSignal = vi.mocked(fetchGalleryDetail).mock.calls[0]![2]!
    store.scheduleProgress({ gid: 2, token: "bbbbbbbbbb", page: 2 })
    useAuthStore().logout()
    useAuthStore().user = { id: 2, username: "second" }
    expect(oldSignal.aborted).toBe(true)
    expect(store.readingProgress.size).toBe(0)
    vi.mocked(fetchGalleryDetail).mockResolvedValueOnce({ ...detail, progress: 9 })
    await store.loadGalleryDetail(1, gallery.token)
    expect(store.readingProgress.get(1)).toBe(9)
    pending.resolve(detail)
    expect(await canceled).toMatchObject({ name: "AbortError" })
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveProgress).not.toHaveBeenCalled()
    expect(store.readingProgress.get(1)).toBe(9)
  })

  /* 每块账号数据都登记在同一张重置表里，这里把「一块都不许漏」钉住：
   * 以后新增一块忘了登记，会在这条用例上失败，而不是等到线上串号才发现。 */
  it("切换账号清空阅读进度并取消两条队列上排队的操作", async () => {
    const pending = deferred<string[]>()
    vi.mocked(fetchSearchHistory).mockReturnValueOnce(pending.promise)
    await store.loadGalleryDetail(1, gallery.token)
    const loading = store.loadSearchHistory().catch((error: unknown) => error)
    expect(store.readingProgress.size).toBe(1)

    useAuthStore().logout()
    useAuthStore().user = { id: 2, username: "second" }

    expect(store.readingProgress.size).toBe(0)
    pending.resolve(["猫"])
    expect(await loading).toMatchObject({ name: "AbortError" })
  })

  it("销毁 Store 取消未触发的保存", async () => {
    store.scheduleProgress(position)
    disposePinia(pinia)
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveProgress).not.toHaveBeenCalled()
  })
})

describe("EH 账号搜索历史", () => {
  /* 四个接口都回整份历史，调用方拿到就整份替换，所以顺序错了就会用旧快照顶掉新的。 */
  it("连续提交、删除与查询按提交顺序逐个发出，各自拿到后端当时的整份历史", async () => {
    const first = deferred<string[]>()
    const second = deferred<string[]>()
    vi.mocked(recordSearch).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    vi.mocked(removeSearch).mockResolvedValue(["second"])
    vi.mocked(fetchSearchHistory).mockResolvedValue(["second"])
    const savingFirst = store.recordSearch("first")
    const savingSecond = store.recordSearch("second")
    const removing = store.removeSearch("first")
    const loading = store.loadSearchHistory()
    await vi.advanceTimersByTimeAsync(0)
    expect(recordSearch).toHaveBeenCalledExactlyOnceWith("first", expect.any(AbortSignal))
    expect(removeSearch).not.toHaveBeenCalled()
    expect(fetchSearchHistory).not.toHaveBeenCalled()
    first.resolve(["first"])
    await expect(savingFirst).resolves.toEqual(["first"])
    await vi.advanceTimersByTimeAsync(0)
    expect(recordSearch).toHaveBeenLastCalledWith("second", expect.any(AbortSignal))
    expect(removeSearch).not.toHaveBeenCalled()
    second.resolve(["second", "first"])
    await expect(savingSecond).resolves.toEqual(["second", "first"])
    await expect(removing).resolves.toEqual(["second"])
    await expect(loading).resolves.toEqual(["second"])
    expect(removeSearch).toHaveBeenCalledExactlyOnceWith("first", expect.any(AbortSignal))
  })

  it("旧账号的在途响应和排队操作不能进入新账号", async () => {
    const pending = deferred<string[]>()
    vi.mocked(recordSearch).mockReturnValueOnce(pending.promise).mockResolvedValue(["new"])
    const old = store.recordSearch("old").catch((error: unknown) => error)
    const queued = store.clearSearchHistory().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    const signal = vi.mocked(recordSearch).mock.calls[0]![1]!
    useAuthStore().logout()
    useAuthStore().user = { id: 2, username: "second" }
    expect(signal.aborted).toBe(true)
    await expect(store.recordSearch("new")).resolves.toEqual(["new"])
    pending.resolve(["old"])
    expect(await old).toMatchObject({ name: "AbortError" })
    expect(await queued).toMatchObject({ name: "AbortError" })
    expect(clearSearchHistory).not.toHaveBeenCalled()
  })

  it("单次失败不阻塞队列，后面排着的操作照常执行", async () => {
    vi.mocked(recordSearch).mockRejectedValue(new Error("断网"))
    vi.mocked(clearSearchHistory).mockResolvedValue([])
    await expect(store.recordSearch("failed")).rejects.toThrow("断网")
    await expect(store.clearSearchHistory()).resolves.toEqual([])
  })
})
