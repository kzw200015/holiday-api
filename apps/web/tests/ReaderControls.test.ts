/* @vitest-environment happy-dom */
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick, ref } from "vue"

import type * as EhApi from "@/features/eh/api"
import { fetchGalleryPreferences, patchGalleryPreferences, saveProgress } from "@/features/eh/api"
import ReaderControls from "@/features/eh/components/ReaderControls.vue"
import { useReaderSession, type ReaderSession } from "@/features/eh/composables/useReaderSession"
import { installQueries } from "@/shared/api/queries"
import { deferred, present, query } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryPreferences: vi.fn(),
  patchGalleryPreferences: vi.fn(),
  saveProgress: vi.fn(),
}))

const cleanups: (() => void)[] = []

/*
 * 操作栏接在一次真实的阅读上：翻页、自动翻页的节奏由会话自己的测试管（useReaderSession.test.ts），
 * 这里看的是按钮与进度条怎么显示、点了之后会话收到了什么。pages 是页数，null 表示详情还没到。
 */
async function createReader({ page = 1, pages = 10 as number | null } = {}) {
  const known = ref(pages ?? undefined)
  let session: ReaderSession | undefined
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({
    setup() {
      const created = useReaderSession({ gid: 1, token: "token", page, pages: known })
      session = created
      return () => h(ReaderControls, { session: created, visible: true, canFullscreen: false, fullscreen: false })
    },
  })
  /* 每个阅读器一份自己的账号数据，和各自打开一个新页面一样。 */
  const pinia = createPinia()
  app.use(pinia)
  installQueries(app)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
    host.remove()
  })
  await vi.advanceTimersByTimeAsync(1)
  return { session: present(session, "阅读会话"), known, host }
}

function autoButton(host: HTMLElement) {
  return query<HTMLButtonElement>(host, "button[aria-pressed]")
}

function intervalText(host: HTMLElement) {
  return query(host, "output").textContent.trim()
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
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("阅读器操作栏", () => {
  it.each(["pointerup", "pointercancel", "lostpointercapture"])(
    "进度条按住期间会话处于拖动进度中、自动翻页暂停，%s 后恢复完整间隔",
    async (endEvent) => {
      const { session, host } = await createReader()
      const input = query(host, "input")
      input.setPointerCapture = vi.fn()
      autoButton(host).click()
      await vi.advanceTimersByTimeAsync(4000)
      input.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1 }))
      await vi.advanceTimersByTimeAsync(10000)
      expect(session.seeking).toBe(true)
      expect(session.page).toBe(1)
      input.dispatchEvent(new PointerEvent(endEvent, { pointerId: 1 }))
      await vi.advanceTimersByTimeAsync(4999)
      expect(session.seeking).toBe(false)
      expect(session.page).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(session.page).toBe(2)
    },
  )

  it("上一页、下一页按钮翻页，到头就不能再点", async () => {
    const { session, host } = await createReader({ pages: 2 })
    const previous = query<HTMLButtonElement>(host, '[aria-label="上一页"]')
    const next = query<HTMLButtonElement>(host, '[aria-label="下一页"]')
    expect(previous.disabled).toBe(true)
    next.click()
    await nextTick()
    expect(session.page).toBe(2)
    expect(next.disabled).toBe(true)
    previous.click()
    await nextTick()
    expect(session.page).toBe(1)
  })

  it("修改间隔立即重新计时，间隔会存下来但开启状态不会", async () => {
    const { session, host } = await createReader()
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(4000)
    query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]').click()
    await nextTick()
    expect(intervalText(host)).toBe("6 秒")
    await vi.advanceTimersByTimeAsync(5999)
    expect(session.page).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(session.page).toBe(2)
    expect(patchGalleryPreferences).toHaveBeenCalledExactlyOnceWith({ readerInterval: 6 })
    /* 重开一个阅读器：间隔按存下来的那份显示，自动翻页不跟着恢复。 */
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], minRating: null, readerInterval: 6 })
    const reopened = await createReader()
    expect(intervalText(reopened.host)).toBe("6 秒")
    expect(autoButton(reopened.host).getAttribute("aria-pressed")).toBe("false")
    query<HTMLButtonElement>(host, '[aria-label="减少自动翻页间隔"]').click()
    await nextTick()
    expect(intervalText(host)).toBe("5 秒")
    await vi.advanceTimersByTimeAsync(5000)
    expect(session.page).toBe(3)
  })

  it.each([
    { seconds: 1, disabledLabel: "减少自动翻页间隔", enabledLabel: "增加自动翻页间隔", next: 2 },
    { seconds: 20, disabledLabel: "增加自动翻页间隔", enabledLabel: "减少自动翻页间隔", next: 19 },
  ])("间隔为 $seconds 秒时禁用越界按钮，反向调整仍可用", async ({ seconds, disabledLabel, enabledLabel, next }) => {
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], minRating: null, readerInterval: seconds })
    const { host } = await createReader()
    const disabledButton = query<HTMLButtonElement>(host, `[aria-label="${disabledLabel}"]`)
    const enabledButton = query<HTMLButtonElement>(host, `[aria-label="${enabledLabel}"]`)
    expect(disabledButton.disabled).toBe(true)
    expect(enabledButton.disabled).toBe(false)
    disabledButton.click()
    await nextTick()
    expect(intervalText(host)).toBe(`${seconds} 秒`)
    enabledButton.click()
    await nextTick()
    expect(intervalText(host)).toBe(`${next} 秒`)
    expect(disabledButton.disabled).toBe(false)
    disabledButton.click()
    await nextTick()
    expect(intervalText(host)).toBe(`${seconds} 秒`)
    expect(disabledButton.disabled).toBe(true)
    /* 越界那两次点击什么也没发生，只有真的改了值才提交。 */
    await vi.advanceTimersByTimeAsync(0)
    expect(patchGalleryPreferences).toHaveBeenNthCalledWith(1, { readerInterval: next })
    expect(patchGalleryPreferences).toHaveBeenLastCalledWith({ readerInterval: seconds })
  })

  /* 改几次就提交几次；同一类写入依次发出，让它们按操作顺序到达，后到的旧值盖不掉新的。 */
  it("连续调整逐次提交，前一次没回来就排队等着", async () => {
    const inflight = deferred<undefined>()
    vi.mocked(patchGalleryPreferences).mockReturnValueOnce(inflight.promise)
    const { host } = await createReader()
    const increase = query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]')
    increase.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(patchGalleryPreferences).toHaveBeenCalledExactlyOnceWith({ readerInterval: 6 })
    increase.click()
    await vi.advanceTimersByTimeAsync(0)
    /* 第一次还没回来，第二次排在后面。 */
    expect(patchGalleryPreferences).toHaveBeenCalledTimes(1)
    expect(intervalText(host)).toBe("7 秒")
    inflight.resolve(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(patchGalleryPreferences).toHaveBeenLastCalledWith({ readerInterval: 7 })
    /* 前一次的响应回来时本地已经是 7 了，不能把它写回 6。 */
    expect(intervalText(host)).toBe("7 秒")
  })

  it("存不上就以服务端为准，也不拿失败打扰用户", async () => {
    vi.mocked(patchGalleryPreferences).mockRejectedValue(new Error("断网"))
    const { host } = await createReader()
    query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]').click()
    await nextTick()
    expect(intervalText(host)).toBe("6 秒")
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    expect(intervalText(host)).toBe("5 秒")
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]').disabled).toBe(false)
  })

  /* 阅读器不经过图库布局，偏好可能还没读到或读失败了；这时手上没有当前间隔可调，按钮不该看起来能用。 */
  it("偏好读到之前间隔不能调", async () => {
    const pending = deferred<EhApi.GalleryPreferences>()
    vi.mocked(fetchGalleryPreferences).mockReturnValueOnce(pending.promise)
    const { host } = await createReader()
    const decrease = query<HTMLButtonElement>(host, '[aria-label="减少自动翻页间隔"]')
    const increase = query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]')
    expect(decrease.disabled).toBe(true)
    expect(increase.disabled).toBe(true)
    expect(intervalText(host)).toBe("…")
    pending.resolve({ categories: [], minRating: null, readerInterval: 8 })
    await vi.advanceTimersByTimeAsync(0)
    expect(intervalText(host)).toBe("8 秒")
    expect(increase.disabled).toBe(false)
  })

  it("偏好读失败时间隔不能调，在原处给出重试", async () => {
    vi.mocked(fetchGalleryPreferences).mockRejectedValueOnce(new Error("断网"))
    const { host } = await createReader()
    const increase = query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]')
    expect(increase.disabled).toBe(true)
    expect(query(host, '[aria-label="减少自动翻页间隔"]').hasAttribute("disabled")).toBe(true)
    query<HTMLButtonElement>(host, '[aria-label="自动翻页间隔没读到，重试"]').click()
    await vi.advanceTimersByTimeAsync(0)
    expect(intervalText(host)).toBe("5 秒")
    expect(increase.disabled).toBe(false)
    expect(patchGalleryPreferences).not.toHaveBeenCalled()
  })

  it("页数到达后创建滑块，保留从 URL 恢复的页码", async () => {
    const { known, host } = await createReader({ page: 3, pages: null })
    expect(host.querySelector('input[type="range"]')).toBeNull()
    known.value = 12
    await nextTick()
    const slider = query<HTMLInputElement>(host, 'input[type="range"]')
    expect(slider.max).toBe("12")
    expect(slider.value).toBe("3")
    expect(slider.getAttribute("aria-valuetext")).toBe("第 3 页，共 12 页")
  })

  it("没有页数或已到末页时开始按钮不能点", async () => {
    const { known, host } = await createReader({ pages: null })
    expect(autoButton(host).disabled).toBe(true)
    known.value = 1
    await nextTick()
    expect(autoButton(host).disabled).toBe(true)
    known.value = 2
    await nextTick()
    expect(autoButton(host).disabled).toBe(false)
  })
})
