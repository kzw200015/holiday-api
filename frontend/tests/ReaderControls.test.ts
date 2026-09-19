/* @vitest-environment happy-dom */
import { createPinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { computed, createApp, h, nextTick, reactive } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import { fetchGalleryPreferences, saveReaderInterval } from "@/api/eh"
import ReaderControls from "@/components/gallery/ReaderControls.vue"
import { useReaderPlayback } from "@/composables/useReaderPlayback"
import { useAuthStore } from "@/stores/AuthStore"

vi.mock("@/api/eh", () => ({
  fetchGalleryPreferences: vi.fn(),
  saveReaderInterval: vi.fn(),
}))

const cleanups: (() => void)[] = []

async function createReader(userId: number | undefined = 1, position: { page?: number; total?: number } = {}) {
  const state = reactive({
    identity: "1/token",
    page: 1,
    total: 10,
    dragging: false,
    seeking: false,
    visible: true,
    ...position,
  })
  const change = vi.fn((page: number) => {
    state.page = page
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/reader",
        component: {
          setup() {
            const playback = useReaderPlayback(
              () => state.identity,
              computed({ get: () => state.page, set: change }),
              () => state.total,
              () => state.dragging || state.seeking,
            )
            return () =>
              h(ReaderControls, {
                key: state.identity,
                page: state.page,
                total: state.total,
                seeking: state.seeking,
                visible: state.visible,
                playback: playback.state,
                onToggleAutoPaging: playback.toggle,
                onSetInterval: playback.setInterval,
                "onUpdate:page": change,
                "onUpdate:seeking": (value: boolean) => {
                  state.seeking = value
                },
              })
          },
        },
      },
      { path: "/away", component: { render: () => h("div") } },
    ],
  })
  await router.push("/reader")
  await router.isReady()
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({ render: () => h(RouterView) })
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)
  useAuthStore(pinia).user = userId === undefined ? null : { id: userId, username: "测试账号" }
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await vi.advanceTimersByTimeAsync(1)
  return { state, change, host, router }
}

function autoButton(host: HTMLElement) {
  return host.querySelector<HTMLButtonElement>("button[aria-pressed]")!
}

function intervalText(host: HTMLElement) {
  return host.querySelector("output")!.textContent.trim()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], readerInterval: 5 })
  vi.mocked(saveReaderInterval).mockResolvedValue(null)
  localStorage.clear()
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("阅读器自动翻页控件", () => {
  it("默认关闭，开始后等待完整间隔，手动换页不改变节奏，暂停后不再前进", async () => {
    const { state, change, host } = await createReader()
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).not.toHaveBeenCalled()
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("false")
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(3000)
    state.page = 4
    await vi.advanceTimersByTimeAsync(1999)
    expect(change).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(change).toHaveBeenLastCalledWith(5)
    await vi.advanceTimersByTimeAsync(5000)
    expect(change).toHaveBeenLastCalledWith(6)
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).toHaveBeenCalledTimes(2)
  })

  it("图片拖动期间修改间隔不会恢复计时，结束后等待完整的新间隔", async () => {
    const { state, change, host } = await createReader()
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(4000)
    state.dragging = true
    await nextTick()
    host.querySelector<HTMLButtonElement>('[aria-label="增加自动翻页间隔"]')!.click()
    await vi.advanceTimersByTimeAsync(10000)
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("true")
    expect(change).not.toHaveBeenCalled()
    state.page = 3
    state.dragging = false
    await vi.advanceTimersByTimeAsync(5999)
    expect(change).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(change).toHaveBeenCalledExactlyOnceWith(4)
  })

  it.each(["pointerup", "pointercancel", "lostpointercapture"])(
    "进度条按住期间暂停，%s 后恢复完整间隔",
    async (endEvent) => {
      const { state, change, host } = await createReader()
      const input = host.querySelector("input")!
      input.setPointerCapture = vi.fn()
      autoButton(host).click()
      await vi.advanceTimersByTimeAsync(4000)
      input.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1 }))
      await vi.advanceTimersByTimeAsync(10000)
      expect(state.seeking).toBe(true)
      expect(change).not.toHaveBeenCalled()
      input.dispatchEvent(new PointerEvent(endEvent, { pointerId: 1 }))
      await vi.advanceTimersByTimeAsync(4999)
      expect(state.seeking).toBe(false)
      expect(change).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(change).toHaveBeenCalledExactlyOnceWith(2)
    },
  )

  it("修改间隔立即重新计时，按账号保存间隔但不保存开启状态", async () => {
    const { change, host } = await createReader()
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(4000)
    host.querySelector<HTMLButtonElement>('[aria-label="增加自动翻页间隔"]')!.click()
    await nextTick()
    expect(intervalText(host)).toBe("6 秒")
    await vi.advanceTimersByTimeAsync(5999)
    expect(change).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(change).toHaveBeenCalledTimes(1)
    expect(saveReaderInterval).toHaveBeenCalledExactlyOnceWith(6, expect.any(AbortSignal))
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], readerInterval: 6 })
    const reopened = await createReader()
    expect(intervalText(reopened.host)).toBe("6 秒")
    expect(autoButton(reopened.host).getAttribute("aria-pressed")).toBe("false")
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], readerInterval: 5 })
    const anotherUser = await createReader(2)
    expect(intervalText(anotherUser.host)).toBe("5 秒")
    host.querySelector<HTMLButtonElement>('[aria-label="减少自动翻页间隔"]')!.click()
    await nextTick()
    expect(intervalText(host)).toBe("5 秒")
    await vi.advanceTimersByTimeAsync(5000)
    expect(change).toHaveBeenCalledTimes(2)
  })

  it.each([
    { seconds: 1, disabledLabel: "减少自动翻页间隔", enabledLabel: "增加自动翻页间隔", next: 2 },
    { seconds: 20, disabledLabel: "增加自动翻页间隔", enabledLabel: "减少自动翻页间隔", next: 19 },
  ])("间隔为 $seconds 秒时禁用越界按钮，反向调整仍可用", async ({ seconds, disabledLabel, enabledLabel, next }) => {
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], readerInterval: seconds })
    const { host } = await createReader()
    const disabledButton = host.querySelector<HTMLButtonElement>(`[aria-label="${disabledLabel}"]`)!
    const enabledButton = host.querySelector<HTMLButtonElement>(`[aria-label="${enabledLabel}"]`)!
    expect(disabledButton.disabled).toBe(true)
    expect(enabledButton.disabled).toBe(false)
    disabledButton.click()
    await nextTick()
    expect(intervalText(host)).toBe(`${seconds} 秒`)
    enabledButton.click()
    await nextTick()
    expect(intervalText(host)).toBe(`${next} 秒`)
    expect(disabledButton.disabled).toBe(false)
    expect(saveReaderInterval).not.toHaveBeenCalled()
    disabledButton.click()
    await nextTick()
    expect(intervalText(host)).toBe(`${seconds} 秒`)
    expect(disabledButton.disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(saveReaderInterval).toHaveBeenCalledExactlyOnceWith(seconds, expect.any(AbortSignal))
  })

  it("连续调整合并保存，离开阅读页补存待提交的间隔", async () => {
    const { host, router } = await createReader()
    const increase = host.querySelector<HTMLButtonElement>('[aria-label="增加自动翻页间隔"]')!
    increase.click()
    await vi.advanceTimersByTimeAsync(500)
    increase.click()
    await vi.advanceTimersByTimeAsync(999)
    expect(saveReaderInterval).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(saveReaderInterval).toHaveBeenCalledExactlyOnceWith(7, expect.any(AbortSignal))
    increase.click()
    await nextTick()
    await router.push("/away")
    expect(saveReaderInterval).toHaveBeenLastCalledWith(8, expect.any(AbortSignal))
    await vi.advanceTimersByTimeAsync(1000)
    expect(saveReaderInterval).toHaveBeenCalledTimes(2)
  })

  it("切换图集时完成待保存的间隔后再读取，新会话不会被旧值覆盖", async () => {
    let finish!: () => void
    vi.mocked(saveReaderInterval).mockImplementation(async (seconds) => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], readerInterval: seconds })
      return null
    })
    const { state, host } = await createReader()
    host.querySelector<HTMLButtonElement>('[aria-label="增加自动翻页间隔"]')!.click()
    state.identity = "2/new"
    await nextTick()
    expect(saveReaderInterval).toHaveBeenCalledExactlyOnceWith(6, expect.any(AbortSignal))
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(1)
    expect(intervalText(host)).toBe("6 秒")
    finish()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(2)
    expect(intervalText(host)).toBe("6 秒")
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("false")
  })

  it("保存失败显示未同步提示，当前间隔继续可用", async () => {
    vi.mocked(saveReaderInterval).mockRejectedValue(new Error("断网"))
    const { host } = await createReader()
    host.querySelector<HTMLButtonElement>('[aria-label="增加自动翻页间隔"]')!.click()
    await vi.advanceTimersByTimeAsync(1000)
    expect(intervalText(host)).toBe("6 秒")
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("未同步到账号")
    expect(host.querySelector<HTMLButtonElement>('[aria-label="增加自动翻页间隔"]')!.disabled).toBe(false)
  })

  it("秒数只读，不提供下拉选择或手动输入", async () => {
    const { host } = await createReader()
    expect(intervalText(host)).toBe("5 秒")
    expect(host.querySelector("select, input:not([type=range]), [contenteditable]")).toBeNull()
  })

  it("页数到达后创建滑块，保留从 URL 恢复的页码", async () => {
    const { state, host } = await createReader(1, { page: 3, total: 0 })
    expect(host.querySelector('input[type="range"]')).toBeNull()
    state.total = 12
    await nextTick()
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!
    expect(slider.max).toBe("12")
    expect(slider.value).toBe("3")
    expect(slider.getAttribute("aria-valuetext")).toBe("第 3 页，共 12 页")
  })

  it("没有页数或已到末页不能启动，到达末页立即停止且不循环", async () => {
    const { state, change, host } = await createReader()
    state.total = 0
    await nextTick()
    expect(autoButton(host).disabled).toBe(true)
    autoButton(host).click()
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("false")
    state.total = 2
    await nextTick()
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(5000)
    expect(state.page).toBe(2)
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("false")
    expect(autoButton(host).disabled).toBe(true)
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).toHaveBeenCalledTimes(1)
  })

  it("切入后台停止，回来需要手动启动；换图集同样停止", async () => {
    const { state, change, host } = await createReader()
    autoButton(host).click()
    await nextTick()
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    await nextTick()
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("false")
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).not.toHaveBeenCalled()
    autoButton(host).click()
    await nextTick()
    state.identity = "2/other"
    await nextTick()
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("false")
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).not.toHaveBeenCalled()
  })

  it("离开路由后停止自动翻页", async () => {
    const { change, host, router } = await createReader()
    autoButton(host).click()
    await nextTick()
    await router.push("/away")
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).not.toHaveBeenCalled()
    expect(host.querySelector("button")).toBeNull()
  })

  it("卸载后清除自动翻页计时器", async () => {
    const { change, host } = await createReader()
    autoButton(host).click()
    await nextTick()
    cleanups.pop()!()
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).not.toHaveBeenCalled()
  })

  it.each([8, 0, 21, 1.5, "10", null])("不读取或迁移旧浏览器间隔 %s", async (value) => {
    localStorage.setItem("myapi.reader-interval.1", JSON.stringify(value))
    const { host } = await createReader()
    expect(intervalText(host)).toBe("5 秒")
  })
})
