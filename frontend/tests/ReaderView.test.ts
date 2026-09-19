/* @vitest-environment happy-dom */
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import type * as EhApi from "@/api/eh"
import { saveProgress } from "@/api/eh"
import ReaderView from "@/views/ReaderView.vue"

vi.mock("@/api/eh", async (importOriginal) => ({
  ...(await importOriginal<typeof EhApi>()),
  fetchGalleryDetail: vi.fn().mockResolvedValue({
    gallery: { title: "测试图集", fileCount: 10 },
    imageUrlTemplate: "/image/{page}",
  }),
  saveProgress: vi.fn().mockResolvedValue(undefined),
  fetchGalleryPreferences: vi.fn().mockResolvedValue({ categories: [], readerInterval: 5 }),
  saveReaderInterval: vi.fn().mockResolvedValue(null),
}))

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
let router: ReturnType<typeof createRouter>
/* 与 ReaderView 里的 URL_SYNC_DELAY 对齐：页码先生效，地址栏节流跟上。 */
const URL_SYNC_DELAY = 300

beforeEach(async () => {
  vi.mocked(saveProgress).mockClear()
  vi.useFakeTimers()
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/:gid/:token/:page",
        name: "reader",
        component: ReaderView,
        props: (route) => ({
          gid: Number(route.params.gid),
          token: route.params.token,
          page: Number(route.params.page),
        }),
      },
    ],
  })
  await router.push("/1/token/1")
  await router.isReady()
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  pinia = createPinia()
  app.use(pinia)
  app.mount(host)
  /* 越过 Vue 事件监听器的挂载时间戳，让冒泡点击被视为挂载后的用户事件。 */
  await vi.advanceTimersByTimeAsync(1)
})

afterEach(() => {
  app?.unmount()
  disposePinia(pinia)
  host.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function readingArea() {
  return host.querySelector<HTMLElement>('[aria-label="横向阅读区域"]')!
}

function controlsState() {
  const bars = [...host.querySelectorAll<HTMLElement>(".absolute.inset-x-0.transition-opacity")]
  return bars.map((bar) => {
    if (bar.classList.contains("opacity-100") && !bar.inert) {
      return "visible"
    }
    if (bar.classList.contains("opacity-0") && bar.inert) {
      return "hidden"
    }
    return "inconsistent"
  })
}

describe("阅读进度保存", () => {
  it("连续翻页防抖保存最后一页，卸载不补报但保留原定保存", async () => {
    await router.replace("/1/token/2")
    await vi.advanceTimersByTimeAsync(500)
    expect(saveProgress).not.toHaveBeenCalled()
    await router.replace("/1/token/3")
    await vi.advanceTimersByTimeAsync(1200)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "token", 3, expect.any(AbortSignal))
    await router.replace("/1/token/4")
    app!.unmount()
    app = undefined
    expect(saveProgress).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1199)
    expect(saveProgress).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(saveProgress).toHaveBeenLastCalledWith(1, "token", 4, expect.any(AbortSignal))
    expect(saveProgress).toHaveBeenCalledTimes(2)
  })

  it("保存较慢时按顺序提交，旧页码不会晚于新页码写入", async () => {
    let finish!: (value: null) => void
    vi.mocked(saveProgress).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    await router.replace("/1/token/2")
    await vi.advanceTimersByTimeAsync(1200)
    await router.replace("/1/token/3")
    await vi.advanceTimersByTimeAsync(1200)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "token", 2, expect.any(AbortSignal))
    finish(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(saveProgress).toHaveBeenNthCalledWith(2, 1, "token", 3, expect.any(AbortSignal))
  })

  it("切换图集不提前补报，两本图集分别保存最后报告的位置", async () => {
    await router.replace("/1/token/8")
    await vi.advanceTimersByTimeAsync(500)
    await router.replace("/2/second/1")
    expect(saveProgress).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(700)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "token", 8, expect.any(AbortSignal))
    await vi.advanceTimersByTimeAsync(500)
    expect(saveProgress).toHaveBeenNthCalledWith(2, 2, "second", 1, expect.any(AbortSignal))
    app!.unmount()
    app = undefined
    expect(saveProgress).toHaveBeenCalledTimes(2)
  })
})

describe("阅读器操作栏", () => {
  it("默认显示且不自动隐藏，单击阅读区域切换显示状态", async () => {
    await vi.advanceTimersByTimeAsync(60000)
    expect(controlsState()).toEqual(["visible", "visible"])
    readingArea().click()
    await nextTick()
    expect(controlsState()).toEqual(["hidden", "hidden"])
    await vi.advanceTimersByTimeAsync(60000)
    expect(controlsState()).toEqual(["hidden", "hidden"])
    readingArea().click()
    await nextTick()
    expect(controlsState()).toEqual(["visible", "visible"])
  })

  it("鼠标移动、指针按下、滚轮和页码变化都不会唤出控件", async () => {
    const area = readingArea()
    area.click()
    await nextTick()
    area.setPointerCapture = vi.fn()
    area.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    area.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", pointerId: 1 }))
    area.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", pointerId: 1 }))
    area.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }))
    await router.replace("/1/token/2")
    await vi.advanceTimersByTimeAsync(10000)
    expect(controlsState()).toEqual(["hidden", "hidden"])
  })

  it.each([
    '[aria-label="下一页"]',
    'input[type="range"]',
    '[aria-label="增加自动翻页间隔"]',
    '[aria-label="减少自动翻页间隔"]',
  ])("点击操作栏中的 %s 不会切换显示状态", async (selector) => {
    host.querySelector<HTMLElement>(selector)!.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(controlsState()).toEqual(["visible", "visible"])
  })

  it("自动翻页不会重新显示已隐藏的控件", async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="开始自动翻页"]')!.click()
    await nextTick()
    readingArea().click()
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000 + URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("2")
    expect(controlsState()).toEqual(["hidden", "hidden"])
  })

  it("鼠标拖动后的 click 不切换控件，下一次正常单击仍然有效", async () => {
    const area = readingArea()
    area.setPointerCapture = vi.fn()
    area.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", pointerId: 1, clientX: 100 }))
    area.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", pointerId: 1, clientX: 20 }))
    area.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", pointerId: 1, clientX: 100 }))
    area.dispatchEvent(new PointerEvent("pointerup", { pointerType: "mouse", pointerId: 1 }))
    area.click()
    await nextTick()
    expect(controlsState()).toEqual(["visible", "visible"])

    area.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", pointerId: 2, clientX: 100 }))
    area.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", pointerId: 2, clientX: 102 }))
    area.dispatchEvent(new PointerEvent("pointerup", { pointerType: "mouse", pointerId: 2 }))
    area.click()
    await nextTick()
    expect(controlsState()).toEqual(["hidden", "hidden"])
  })

  it("进度条立即生效、地址栏节流跟上，越界地址仍按实际页数收敛", async () => {
    const input = host.querySelector<HTMLInputElement>('input[type="range"]')!
    input.value = "6"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    /* 控件当场就是新页码，不等路由生效，所以拖动不会被旧值拽回去。 */
    expect(input.value).toBe("6")
    expect(router.currentRoute.value.params.page).toBe("1")
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("6")
    await router.replace("/1/token/99")
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("10")
    expect(input.value).toBe("10")
    expect(host.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.disabled).toBe(true)
  })

  it("键盘翻页继续更新 URL，控件上的键盘操作不触发全局翻页", async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("10")
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("1")
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("2")
    host
      .querySelector('[aria-label="增加自动翻页间隔"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("2")
  })

  /* 连翻几页只在停下之后写一次地址栏：滚动每帧都在变，路由不该跟着抖。 */
  it("连续翻页期间不逐页写地址栏，停下后只落最后一页", async () => {
    for (const key of ["ArrowRight", "ArrowRight", "ArrowRight"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key }))
      /* eslint-disable-next-line no-await-in-loop -- 必须逐次推进，才能让三次翻页落在同一个节流窗口里。 */
      await vi.advanceTimersByTimeAsync(50)
    }
    expect(router.currentRoute.value.params.page).toBe("1")
    const before = router.currentRoute.value.fullPath
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("4")
    expect(before).not.toBe(router.currentRoute.value.fullPath)
  })

  it("切换图集重建图片和控件，清除拖动状态并停止自动翻页", async () => {
    await vi.advanceTimersByTimeAsync(200)
    const originalImage = readingArea().querySelector("img")
    host.querySelector<HTMLButtonElement>('[aria-label="开始自动翻页"]')!.click()
    const input = host.querySelector("input")!
    input.setPointerCapture = vi.fn()
    input.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1 }))
    await nextTick()
    await router.replace("/2/other/1")
    await vi.advanceTimersByTimeAsync(10000)
    expect(router.currentRoute.value.params.page).toBe("1")
    expect(host.querySelector("button[aria-pressed]")!.getAttribute("aria-pressed")).toBe("false")
    const nextImage = readingArea().querySelector("img")
    expect(nextImage).not.toBeNull()
    expect(nextImage).not.toBe(originalImage)
  })

  it("触屏轻点同样通过 click 切换，不在按下时切换", async () => {
    const area = readingArea()
    area.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 1 }))
    await nextTick()
    expect(controlsState()).toEqual(["visible", "visible"])
    area.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 1 }))
    area.click()
    await nextTick()
    expect(controlsState()).toEqual(["hidden", "hidden"])
  })
})
