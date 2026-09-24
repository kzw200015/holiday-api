/* @vitest-environment happy-dom */
import type { galleryPreferencesSchema } from "@myapi/shared/eh"
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { computed, createApp, h, nextTick, reactive } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"
import type { z } from "zod"

import type * as EhApi from "@/features/eh/api"
import { fetchGalleryPreferences, saveGalleryPreferences } from "@/features/eh/api"
import ReaderControls from "@/features/eh/components/ReaderControls.vue"
import { useReaderPlayback } from "@/features/eh/composables/useReaderPlayback"
import { deferred, present, query } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryPreferences: vi.fn(),
  saveGalleryPreferences: vi.fn(),
}))

const cleanups: (() => void)[] = []

async function createReader(position: { page?: number; total?: number } = {}) {
  const state = reactive({
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
              computed({ get: () => state.page, set: change }),
              () => state.total,
              () => state.dragging || state.seeking,
            )
            return () =>
              h(ReaderControls, {
                page: state.page,
                total: state.total,
                seeking: state.seeking,
                visible: state.visible,
                playback: playback.state,
                onToggleAutoPaging: playback.toggle,
                onSetInterval: playback.changeInterval,
                onReloadInterval: playback.reloadInterval,
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
  app.use(router)
  /* 每个阅读器一份自己的账号数据，和各自打开一个新页面一样。 */
  const pinia = createPinia()
  app.use(pinia)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
    host.remove()
  })
  await vi.advanceTimersByTimeAsync(1)
  return { state, change, host, router }
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
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], readerInterval: 5 })
  vi.mocked(saveGalleryPreferences).mockResolvedValue(null)
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
    query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]').click()
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
      const input = query(host, "input")
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

  it("修改间隔立即重新计时，间隔会存下来但开启状态不会", async () => {
    const { change, host } = await createReader()
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(4000)
    query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]').click()
    await nextTick()
    expect(intervalText(host)).toBe("6 秒")
    await vi.advanceTimersByTimeAsync(5999)
    expect(change).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(change).toHaveBeenCalledTimes(1)
    expect(saveGalleryPreferences).toHaveBeenCalledExactlyOnceWith({ categories: [], readerInterval: 6 })
    /* 重开一个阅读器：间隔按存下来的那份显示，自动翻页不跟着恢复。 */
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], readerInterval: 6 })
    const reopened = await createReader()
    expect(intervalText(reopened.host)).toBe("6 秒")
    expect(autoButton(reopened.host).getAttribute("aria-pressed")).toBe("false")
    query<HTMLButtonElement>(host, '[aria-label="减少自动翻页间隔"]').click()
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
    expect(saveGalleryPreferences).toHaveBeenNthCalledWith(1, { categories: [], readerInterval: next })
    expect(saveGalleryPreferences).toHaveBeenLastCalledWith({ categories: [], readerInterval: seconds })
  })

  /* 改几次就提交几次；同一条 scope 让它们按操作顺序到达，后到的旧值盖不掉新的。 */
  it("连续调整逐次提交，前一次没回来就排队等着", async () => {
    const inflight = deferred<null>()
    vi.mocked(saveGalleryPreferences).mockReturnValueOnce(inflight.promise)
    const { host } = await createReader()
    const increase = query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]')
    increase.click()
    await nextTick()
    expect(saveGalleryPreferences).toHaveBeenCalledExactlyOnceWith({ categories: [], readerInterval: 6 })
    increase.click()
    await nextTick()
    /* 第一次还没回来，第二次排在后面。 */
    expect(saveGalleryPreferences).toHaveBeenCalledTimes(1)
    expect(intervalText(host)).toBe("7 秒")
    inflight.resolve(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(saveGalleryPreferences).toHaveBeenLastCalledWith({ categories: [], readerInterval: 7 })
    /* 前一次的响应回来时本地已经是 7 了，不能把它写回 6。 */
    expect(intervalText(host)).toBe("7 秒")
  })

  /* 范围外的间隔会被服务端整份退回，之后每次保存都跟着失败，所以到头了就不让再调。 */
  it.each([
    [1, "减少自动翻页间隔"],
    [20, "增加自动翻页间隔"],
  ])("间隔到了 %i 秒就不能再往外调", async (readerInterval, label) => {
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: [], readerInterval })
    const { host } = await createReader()
    const button = query<HTMLButtonElement>(host, `[aria-label="${label}"]`)
    expect(button.disabled).toBe(true)
    button.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(intervalText(host)).toBe(`${readerInterval} 秒`)
    expect(saveGalleryPreferences).not.toHaveBeenCalled()
  })

  it("推送失败不改动当前间隔，也不拿失败打扰用户", async () => {
    vi.mocked(saveGalleryPreferences).mockRejectedValue(new Error("断网"))
    const { host } = await createReader()
    query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]').click()
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    expect(intervalText(host)).toBe("6 秒")
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]').disabled).toBe(false)
  })

  /* 阅读器不经过图库布局，偏好可能还没读到或读失败了；这时调了也存不上，按钮不该看起来能用。 */
  it("偏好读到之前间隔不能调", async () => {
    const pending = deferred<z.output<typeof galleryPreferencesSchema>>()
    vi.mocked(fetchGalleryPreferences).mockReturnValueOnce(pending.promise)
    const { host } = await createReader()
    const decrease = query<HTMLButtonElement>(host, '[aria-label="减少自动翻页间隔"]')
    const increase = query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]')
    expect(decrease.disabled).toBe(true)
    expect(increase.disabled).toBe(true)
    expect(intervalText(host)).toBe("…")
    pending.resolve({ categories: [], readerInterval: 8 })
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
    expect(saveGalleryPreferences).not.toHaveBeenCalled()
  })

  it("秒数只读，不提供下拉选择或手动输入", async () => {
    const { host } = await createReader()
    expect(intervalText(host)).toBe("5 秒")
    expect(host.querySelector("select, input:not([type=range]), [contenteditable]")).toBeNull()
  })

  it("页数到达后创建滑块，保留从 URL 恢复的页码", async () => {
    const { state, host } = await createReader({ page: 3, total: 0 })
    expect(host.querySelector('input[type="range"]')).toBeNull()
    state.total = 12
    await nextTick()
    const slider = query<HTMLInputElement>(host, 'input[type="range"]')
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

  it("切入后台就停下，回到前台不自己转起来", async () => {
    const { change, host } = await createReader()
    autoButton(host).click()
    await nextTick()
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    await nextTick()
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("false")
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).not.toHaveBeenCalled()
    /* 回到前台只是重新可以开始，要再点一次才继续翻。 */
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    await nextTick()
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("false")
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).not.toHaveBeenCalled()
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(5000)
    expect(change).toHaveBeenCalledWith(2)
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
    present(cleanups.pop(), "卸载回调")()
    await vi.advanceTimersByTimeAsync(10000)
    expect(change).not.toHaveBeenCalled()
  })

  it.each([8, 0, 21, 1.5, "10", null])("不读取或迁移旧浏览器间隔 %s", async (value) => {
    localStorage.setItem("myapi.reader-interval.1", JSON.stringify(value))
    const { host } = await createReader()
    expect(intervalText(host)).toBe("5 秒")
  })
})
