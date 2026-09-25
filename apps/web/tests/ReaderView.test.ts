/* @vitest-environment happy-dom */
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick, type Component as VueComponent } from "vue"
import { createMemoryHistory, createRouter, RouterView, type RouteLocationNormalizedLoaded } from "vue-router"

import type * as EhApi from "@/features/eh/api"
import { fetchGalleryDetail, saveProgress } from "@/features/eh/api"
import { readerInstanceKey } from "@/features/eh/navigation"
import ReaderView from "@/features/eh/views/ReaderView.vue"
import { installQueries } from "@/shared/api/queries"
import { deferred, present, query } from "./support"

vi.mock("@/features/eh/api", async (importOriginal) => ({
  ...(await importOriginal<typeof EhApi>()),
  fetchGalleryDetail: vi.fn().mockResolvedValue({
    gallery: { title: "测试图集", fileCount: 10 },
    imageUrlTemplate: "/image/{page}",
  }),
  saveProgress: vi.fn().mockResolvedValue(undefined),
  fetchGalleryPreferences: vi.fn().mockResolvedValue({ categories: [], readerInterval: 5 }),
  patchGalleryPreferences: vi.fn().mockResolvedValue(null),
}))

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
let router: ReturnType<typeof createRouter>
/* 与 ReaderView 里的 URL_SYNC_DELAY 对齐：页码先生效，地址栏节流跟上。 */
const URL_SYNC_DELAY = 300
/* 离开阅读器要去的页面。默认当场加载完；要模拟首次访问时还在下载页面代码，就换成一个晚点才兑现的。 */
let awayPage: Promise<VueComponent>

beforeEach(async () => {
  vi.mocked(saveProgress).mockClear()
  vi.mocked(fetchGalleryDetail).mockClear()
  awayPage = Promise.resolve({ render: () => h("div", "其他页面") })
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
      { path: "/away", component: () => awayPage },
    ],
  })
  await router.push("/1/token/1")
  await router.isReady()
  host = document.createElement("div")
  document.body.append(host)
  /* 和 App.vue 一样按图集给阅读器设 key，换图集时整个重建。 */
  app = createApp({
    render: () =>
      h(RouterView, null, {
        default: ({ Component, route }: { Component: VueComponent; route: RouteLocationNormalizedLoaded }) =>
          Component ? h(Component, { key: readerInstanceKey(route) }) : null,
      }),
  })
  app.use(router)
  pinia = createPinia()
  app.use(pinia)
  installQueries(app)
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
  return query<HTMLElement>(host, '[aria-label="横向阅读区域"]')
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
  it("连续翻页只保存最后一页；卸载时把还没发出的那次补上", async () => {
    await router.replace("/1/token/2")
    await vi.advanceTimersByTimeAsync(500)
    expect(saveProgress).not.toHaveBeenCalled()
    await router.replace("/1/token/3")
    await vi.advanceTimersByTimeAsync(1200)
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "token", 3)
    /* 正常离开走的是路由，那条路径会补提交；不经路由直接卸载的，卸载时兜底补一次。 */
    await router.replace("/1/token/4")
    present(app, "应用").unmount()
    app = undefined
    await vi.advanceTimersByTimeAsync(1200)
    expect(saveProgress).toHaveBeenCalledTimes(2)
    expect(saveProgress).toHaveBeenLastCalledWith(1, "token", 4)
  })

  /* 地址是外部输入：缓存里有详情时页数一开始就知道，越界页码当场收回，不能先把它上报出去。 */
  it("详情已在缓存里时，越界页码当场收回，只上报收回后的页", async () => {
    await router.replace("/2/other/1")
    await router.replace("/1/token/99")
    await vi.advanceTimersByTimeAsync(1200 + URL_SYNC_DELAY)
    /* 回到第 1 本照样重读，但手上那份在重读期间就能用来收回页码 */
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(3)
    expect(saveProgress).not.toHaveBeenCalledWith(1, "token", 99)
    expect(saveProgress).toHaveBeenLastCalledWith(1, "token", 10)
    expect(router.currentRoute.value.params.page).toBe("10")
  })

  /* 换图集会重建阅读器，重建前先把上一本攒着的位置发掉。 */
  it("换图集后两本各自最后报告的位置都会保存", async () => {
    await router.replace("/1/token/8")
    await vi.advanceTimersByTimeAsync(500)
    await router.replace("/2/second/1")
    await vi.advanceTimersByTimeAsync(1200)
    expect(saveProgress).toHaveBeenCalledTimes(2)
    expect(saveProgress).toHaveBeenCalledWith(1, "token", 8)
    expect(saveProgress).toHaveBeenCalledWith(2, "second", 1)
    present(app, "应用").unmount()
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
    query<HTMLElement>(host, selector).click()
    await vi.advanceTimersByTimeAsync(0)
    expect(controlsState()).toEqual(["visible", "visible"])
  })

  it("自动翻页不会重新显示已隐藏的控件", async () => {
    query<HTMLButtonElement>(host, '[aria-label="开始自动翻页"]').click()
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
    const input = query<HTMLInputElement>(host, 'input[type="range"]')
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
    expect(query<HTMLButtonElement>(host, '[aria-label="下一页"]').disabled).toBe(true)
  })

  it("键盘翻页继续更新 URL；焦点在按钮上时方向键照常翻页，空格和回车留给按钮", async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("10")
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("1")
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("2")
    /* 用鼠标点过「下一页」之后焦点就留在按钮上，键盘翻页不能因此失灵。 */
    const button = query(host, '[aria-label="下一页"]')
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("3")
    for (const key of [" ", "Enter"]) {
      const press = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      button.dispatchEvent(press)
      expect(press.defaultPrevented).toBe(false)
    }
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("3")
  })

  it("焦点在滑块里或按着修饰键时不接管按键", async () => {
    query(host, 'input[type="range"]').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    /* Alt+← 与 ⌘+← 是浏览器的后退，Ctrl+End 之类也各有用处。 */
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }))
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", metaKey: true }))
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "End", ctrlKey: true }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("1")
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
    query<HTMLButtonElement>(host, '[aria-label="开始自动翻页"]').click()
    const input = query(host, "input")
    input.setPointerCapture = vi.fn()
    input.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1 }))
    await nextTick()
    await router.replace("/2/other/1")
    await vi.advanceTimersByTimeAsync(10000)
    expect(router.currentRoute.value.params.page).toBe("1")
    expect(query(host, "button[aria-pressed]").getAttribute("aria-pressed")).toBe("false")
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

describe("阅读器的边界情况", () => {
  it("第一次就读不到详情时显示错误", async () => {
    vi.mocked(fetchGalleryDetail).mockRejectedValueOnce(new Error("上游超时"))
    await router.replace("/3/broken/1")
    await vi.advanceTimersByTimeAsync(0)
    expect(host.textContent).toContain("打不开这个图集")
    expect(host.textContent).toContain("上游超时")
  })

  /* 进入阅读器都会在后台重读详情；重读失败时手上那份的图片地址照样能用，不该把正在读的图换成错误页。 */
  it("详情重读失败时，阅读器照常可用", async () => {
    await router.replace("/2/other/1")
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(fetchGalleryDetail).mockRejectedValueOnce(new Error("上游超时"))
    await router.replace("/1/token/3")
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchGalleryDetail).toHaveBeenLastCalledWith(1, "token", expect.any(AbortSignal))
    expect(host.textContent).not.toContain("打不开这个图集")
    expect(readingArea()).not.toBeNull()
    expect(query<HTMLInputElement>(host, 'input[type="range"]').value).toBe("3")
  })

  it("没有页面的图集直接说明，键盘翻页也不越过第 1 页", async () => {
    vi.mocked(fetchGalleryDetail).mockResolvedValueOnce({
      gallery: { title: "空图集", fileCount: 0 },
      imageUrlTemplate: "/image/{page}",
    } as Awaited<ReturnType<typeof EhApi.fetchGalleryDetail>>)
    await router.replace("/3/empty/1")
    await vi.advanceTimersByTimeAsync(0)
    expect(host.textContent).toContain("这个图集没有可以阅读的页面")
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("1")
    expect(saveProgress).not.toHaveBeenCalledWith(3, "empty", expect.anything())
  })

  /* 首次访问时目标页面的代码还在下载，离开导航要等它；这期间迟到的地址栏同步会把离开顶掉。 */
  it("离开的导航还没完成时，再翻页也不会把人拽回阅读器", async () => {
    const away = deferred<VueComponent>()
    awayPage = away.promise
    query<HTMLButtonElement>(host, '[aria-label="开始自动翻页"]').click()
    await nextTick()
    const leaving = router.push("/away")
    await vi.advanceTimersByTimeAsync(0)
    /* 离开时自动翻页就停了；惯性滚动这类仍可能再改一次页码。 */
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    await vi.advanceTimersByTimeAsync(10000)
    away.resolve({ render: () => h("div", "其他页面") })
    await leaving
    await vi.advanceTimersByTimeAsync(0)
    expect(router.currentRoute.value.path).toBe("/away")
    /* 离开之后才翻到的那页，卸载时补上。 */
    expect(saveProgress).toHaveBeenLastCalledWith(1, "token", 2)
  })

  it("离开被新的导航取消后，地址栏照常跟上页码", async () => {
    const away = deferred<VueComponent>()
    awayPage = away.promise
    const leaving = router.push("/away")
    await vi.advanceTimersByTimeAsync(0)
    await router.replace("/1/token/5")
    away.resolve({ render: () => h("div", "其他页面") })
    await leaving
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    await vi.advanceTimersByTimeAsync(URL_SYNC_DELAY)
    expect(router.currentRoute.value.params.page).toBe("6")
  })
})
