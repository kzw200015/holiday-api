/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick, ref, watch } from "vue"

import type * as EhApi from "@/features/eh/api"
import { fetchGalleryPreferences, patchGalleryPreferences, saveProgress } from "@/features/eh/api"
import { useReaderSession } from "@/features/eh/composables/useReaderSession"
import { composableTests, deferred } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryPreferences: vi.fn(),
  patchGalleryPreferences: vi.fn(),
  saveProgress: vi.fn(),
}))

/* 与 useReadingProgress 里的 SAVE_DELAY 对齐。 */
const SAVE_DELAY = 1200

const t = composableTests()

/* 打开一本图集读。pages 是页数，null 表示详情还没到；turns 记下每次翻到的页，看得出是不是自己翻的。 */
async function openReader({ page = 1, pages = 10 as number | null } = {}) {
  const known = ref(pages ?? undefined)
  const session = t.mount(() => useReaderSession({ gid: 1, token: "token", page, pages: known }))
  const turns: number[] = []
  watch(
    () => session.page,
    (next) => turns.push(next),
    { flush: "sync" },
  )
  /* 等偏好读到，间隔才有值。 */
  await vi.advanceTimersByTimeAsync(0)
  return { session, known, turns }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], minRating: null, readerInterval: 5 })
  vi.mocked(patchGalleryPreferences).mockResolvedValue(undefined)
  vi.mocked(saveProgress).mockResolvedValue(undefined)
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
})
afterEach(() => {
  /* happy-dom 本来没有屏幕常亮，用例里装上的替身在这里拆掉。 */
  Reflect.deleteProperty(navigator, "wakeLock")
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("页码", () => {
  it("页数到手之前只保证不小于 1；到手后越界的页码当场收回，只上报收回后的页", async () => {
    const { session, known } = await openReader({ page: 99, pages: null })
    expect(session.page).toBe(99)
    session.page = 0
    expect(session.page).toBe(1)
    session.page = 99
    known.value = 10
    expect(session.page).toBe(10)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "token", 10)
    session.page = 11
    expect(session.page).toBe(10)
  })

  it("没有页面的图集停在第 1 页，也不上报", async () => {
    const { session } = await openReader({ page: 3, pages: 0 })
    expect(session.page).toBe(1)
    session.page = 2
    expect(session.page).toBe(1)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    expect(saveProgress).not.toHaveBeenCalled()
  })
})

describe("阅读进度上报", () => {
  it("连续翻页只保存最后一页；离开时把还没发出的那次当场补上", async () => {
    const { session } = await openReader()
    session.page = 2
    await vi.advanceTimersByTimeAsync(500)
    session.page = 3
    await vi.advanceTimersByTimeAsync(SAVE_DELAY)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "token", 3)
    session.page = 4
    await nextTick()
    session.leave()
    expect(saveProgress).toHaveBeenCalledTimes(2)
    expect(saveProgress).toHaveBeenLastCalledWith(1, "token", 4)
  })
})

describe("自动翻页", () => {
  it("默认关闭，开始后等待完整间隔，手动换页不改变节奏，暂停后不再前进", async () => {
    const { session, turns } = await openReader()
    await vi.advanceTimersByTimeAsync(10000)
    expect(session.playback.autoPaging).toBe(false)
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(3000)
    session.page = 4
    await vi.advanceTimersByTimeAsync(1999)
    expect(session.page).toBe(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(session.page).toBe(5)
    await vi.advanceTimersByTimeAsync(5000)
    expect(session.page).toBe(6)
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(10000)
    expect(turns).toEqual([4, 5, 6])
  })

  it.each(["dragging", "seeking"] as const)("%s 期间暂停，改间隔也不恢复计时，结束后等待完整的新间隔", async (hold) => {
    const { session, turns } = await openReader()
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(4000)
    session[hold] = true
    await nextTick()
    session.changeInterval(6)
    await vi.advanceTimersByTimeAsync(10000)
    expect(session.playback.autoPaging).toBe(true)
    expect(turns).toEqual([])
    session.page = 3
    session[hold] = false
    await vi.advanceTimersByTimeAsync(5999)
    expect(session.page).toBe(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(session.page).toBe(4)
  })

  it("超出范围的间隔当场挡掉，不改也不提交", async () => {
    const { session } = await openReader()
    session.changeInterval(0)
    session.changeInterval(21)
    await vi.advanceTimersByTimeAsync(0)
    expect(session.playback.interval).toBe(5)
    expect(patchGalleryPreferences).not.toHaveBeenCalled()
  })

  it("没有页数或已到末页不能启动，到达末页立即停止且不循环", async () => {
    const { session, known, turns } = await openReader({ pages: null })
    expect(session.playback.canStart).toBe(false)
    session.toggleAutoPaging()
    expect(session.playback.autoPaging).toBe(false)
    known.value = 2
    await nextTick()
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(5000)
    expect(session.page).toBe(2)
    expect(session.playback.autoPaging).toBe(false)
    expect(session.playback.canStart).toBe(false)
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(10000)
    expect(turns).toEqual([2])
  })

  it("切入后台就停下，回到前台不自己转起来", async () => {
    const { session, turns } = await openReader()
    session.toggleAutoPaging()
    await nextTick()
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    await nextTick()
    expect(session.playback.autoPaging).toBe(false)
    await vi.advanceTimersByTimeAsync(10000)
    /* 回到前台只是重新可以开始，要再开一次才继续翻。 */
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    await nextTick()
    expect(session.playback.autoPaging).toBe(false)
    await vi.advanceTimersByTimeAsync(10000)
    expect(turns).toEqual([])
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(5000)
    expect(turns).toEqual([2])
  })

  it("离开后自动翻页停下", async () => {
    const { session, turns } = await openReader()
    session.toggleAutoPaging()
    await nextTick()
    session.leave()
    await vi.advanceTimersByTimeAsync(10000)
    expect(session.playback.autoPaging).toBe(false)
    expect(turns).toEqual([])
  })
})

/* 阅读器只用得到锁的 release。 */
interface Lock {
  release: () => Promise<void>
}

/* 屏幕常亮的替身：记下每次申请拿到的锁，看它们有没有被放开。 */
function stubWakeLock(request?: () => Promise<Lock>) {
  const locks: { release: ReturnType<typeof vi.fn> }[] = []
  const wakeLock = {
    request: vi.fn(
      request ??
        (async () => {
          const lock = { release: vi.fn(async () => {}) }
          locks.push(lock)
          return lock
        }),
    ),
  }
  Object.defineProperty(navigator, "wakeLock", { value: wakeLock, configurable: true })
  return { wakeLock, locks, held: () => locks.filter((lock) => lock.release.mock.calls.length === 0).length }
}

describe("自动翻页时屏幕常亮", () => {
  it("开着时屏幕常亮，暂停、翻到末页、卸载都放开", async () => {
    const { wakeLock, locks, held } = stubWakeLock()
    const { session } = await openReader({ pages: 3 })
    expect(wakeLock.request).not.toHaveBeenCalled()
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(0)
    expect(wakeLock.request).toHaveBeenCalledExactlyOnceWith("screen")
    expect(held()).toBe(1)
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(0)
    expect(held()).toBe(0)
    /* 自己翻到末页停下时同样放开。 */
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(10000)
    expect(session.page).toBe(3)
    expect(held()).toBe(0)
    session.page = 1
    await nextTick()
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(0)
    expect(held()).toBe(1)
    t.unmount(session)
    await vi.advanceTimersByTimeAsync(0)
    expect(held()).toBe(0)
    expect(locks).toHaveLength(3)
  })

  it("还没拿到锁就暂停了，拿到后当场放开", async () => {
    const granted = deferred<Lock>()
    const release = vi.fn(async () => {})
    const { wakeLock } = stubWakeLock(() => granted.promise)
    const { session } = await openReader()
    session.toggleAutoPaging()
    await nextTick()
    expect(wakeLock.request).toHaveBeenCalledOnce()
    session.toggleAutoPaging()
    await nextTick()
    granted.resolve({ release })
    await vi.advanceTimersByTimeAsync(0)
    expect(release).toHaveBeenCalledOnce()
  })

  it("拿不到常亮也照常自动翻页", async () => {
    stubWakeLock(() => Promise.reject(new Error("省电模式")))
    const { session } = await openReader()
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(5000)
    expect(session.page).toBe(2)
    /* 放开一把没拿到的锁也不出错。 */
    session.toggleAutoPaging()
    await vi.advanceTimersByTimeAsync(0)
    expect(session.playback.autoPaging).toBe(false)
  })
})
