/* @vitest-environment happy-dom */
import type * as VueUse from "@vueuse/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick, reactive } from "vue"

import ReaderStrip from "@/components/gallery/ReaderStrip.vue"

let resize: (entries: { contentRect: { width: number; height: number } }[]) => void
vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof VueUse>()),
  useResizeObserver: vi.fn((_target, callback) => {
    resize = callback
  }),
}))
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement("div")
})
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.useRealTimers()
})

async function setup(page = 1) {
  const props = reactive({ page, total: 100, template: "/image/{page}?signed=true", seeking: false, dragging: false })
  const change = vi.fn((next: number) => {
    props.page = next
  })
  const draggingChange = vi.fn((value: boolean) => {
    props.dragging = value
  })
  app = createApp({
    render: () => h(ReaderStrip, { ...props, "onUpdate:page": change, "onUpdate:dragging": draggingChange }),
  })
  app.mount(host)
  const element = host.firstElementChild as HTMLElement
  element.setPointerCapture = vi.fn()
  element.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
    const left = typeof options === "number" ? options : options?.left
    element.scrollLeft = left ?? element.scrollLeft
    element.dispatchEvent(new Event("scroll"))
  })
  resize([{ contentRect: { width: 700, height: 1000 } }])
  await nextTick()
  element.dispatchEvent(new Event("scroll"))
  return { props, element, change, draggingChange }
}

function imagePages(element: HTMLElement) {
  return [...element.children].flatMap((page, index) => (page.querySelector("img") ? [index + 1] : []))
}

function pageWidths(element: HTMLElement) {
  return [...element.children].map((page) => parseFloat((page as HTMLElement).style.width))
}

function loadImage(element: HTMLElement, page: number, width: number, height: number) {
  const image = element.children[page - 1]!.querySelector("img")!
  Object.defineProperties(image, {
    naturalWidth: { value: width, configurable: true },
    naturalHeight: { value: height, configurable: true },
  })
  image.dispatchEvent(new Event("load"))
}

describe("横向阅读图片条", () => {
  it("换页使用平滑滚动，途中不回写中间页，停稳后才加载目标附近图片", async () => {
    const { props, element, change } = await setup()
    await vi.advanceTimersByTimeAsync(200)
    vi.mocked(element.scrollTo).mockImplementation(() => {})
    props.page = 5
    await nextTick()
    await nextTick()
    expect(element.scrollTo).toHaveBeenLastCalledWith({ left: 2800, behavior: "smooth" })
    element.scrollLeft = 700
    element.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(300)
    expect(props.page).toBe(5)
    expect(change).not.toHaveBeenCalled()
    expect(imagePages(element)).toEqual([1, 2, 3])
    element.scrollLeft = 2800
    element.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(200)
    expect(imagePages(element)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("滚轮可打断平滑换页，恢复按实际位置更新页码", async () => {
    const { props, element } = await setup()
    vi.mocked(element.scrollTo).mockImplementation(() => {})
    props.page = 5
    await nextTick()
    await nextTick()
    element.scrollLeft = 700
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }))
    expect(element.scrollTo).toHaveBeenLastCalledWith({ left: 700, behavior: "instant" })
    element.dispatchEvent(new Event("scroll"))
    await nextTick()
    expect(props.page).toBe(2)
    expect(element.scrollLeft).toBe(800)
  })

  it("动画途中再次换页，以新目标为准，不被途中位置覆盖", async () => {
    const { props, element } = await setup()
    vi.mocked(element.scrollTo).mockImplementation(() => {})
    props.page = 5
    await nextTick()
    await nextTick()
    element.scrollLeft = 700
    props.page = 2
    await nextTick()
    await nextTick()
    expect(element.scrollTo).toHaveBeenLastCalledWith({ left: 700, behavior: "smooth" })
    element.dispatchEvent(new Event("scroll"))
    expect(props.page).toBe(2)
    await vi.advanceTimersByTimeAsync(200)
    expect(imagePages(element)).toEqual([1, 2, 3, 4])
  })

  it("动画途中图片宽度更新会重新定位目标，尺寸变化则即时定位", async () => {
    const { props, element } = await setup()
    await vi.advanceTimersByTimeAsync(200)
    vi.mocked(element.scrollTo).mockImplementation(() => {})
    props.page = 5
    await nextTick()
    await nextTick()
    element.scrollLeft = 700
    loadImage(element, 2, 500, 1000)
    await nextTick()
    await nextTick()
    expect(element.scrollTo).toHaveBeenLastCalledWith({ left: 2600, behavior: "smooth" })
    resize([{ contentRect: { width: 700, height: 500 } }])
    await nextTick()
    expect(element.scrollTo).toHaveBeenLastCalledWith({ left: 1125, behavior: "instant" })
  })

  it("进度条拖动仍即时定位，不启动平滑动画", async () => {
    const { props, element } = await setup()
    props.seeking = true
    props.page = 5
    await nextTick()
    await nextTick()
    expect(element.scrollTo).toHaveBeenLastCalledWith({ left: 2800, behavior: "instant" })
  })

  it.each([
    { width: 390, height: 800, ratio: 0.7 },
    { width: 390, height: 800, ratio: 0.2 },
    { width: 800, height: 390, ratio: 0.7 },
    { width: 1200, height: 800, ratio: 2 },
    { width: 1200, height: 800, ratio: 0.7 },
  ])(
    "阅读区 $width × $height、图片比例 $ratio 时完整容纳整页，跳到下一页仍完整可见",
    async ({ width, height, ratio }) => {
      const { element, props } = await setup(4)
      await vi.advanceTimersByTimeAsync(200)
      resize([{ contentRect: { width, height } }])
      await nextTick()
      loadImage(element, 5, ratio * 1000, 1000)
      await nextTick()
      const widths = pageWidths(element)
      expect(widths[4]).toBe(Math.min(width, height * ratio))
      expect(widths[4] / ratio).toBeLessThanOrEqual(height)
      props.page = 5
      await nextTick()
      await nextTick()
      const left = widths.slice(0, 4).reduce((sum, value) => sum + value, 0)
      expect(left).toBeGreaterThanOrEqual(element.scrollLeft)
      expect(left + widths[4]).toBeLessThanOrEqual(element.scrollLeft + width)
      element.dispatchEvent(new Event("scroll"))
      expect(props.page).toBe(5)
      resize([{ contentRect: { width: height, height: width } }])
      await nextTick()
      element.dispatchEvent(new Event("scroll"))
      expect(props.page).toBe(5)
      expect(pageWidths(element)[4]).toBe(Math.min(height, width * ratio))
    },
  )

  it("停留200毫秒后才加载可见页和两侧各两页，长图集不一次加载全部", async () => {
    const { element } = await setup(20)
    await vi.advanceTimersByTimeAsync(199)
    expect(imagePages(element)).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(imagePages(element)).toEqual([18, 19, 20, 21, 22])
    expect(element.children).toHaveLength(100)
  })

  it("连续跳页取消途中加载；进度条按住不加载，松手后重新计时", async () => {
    const { props, element } = await setup()
    props.seeking = true
    props.page = 30
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(imagePages(element)).toEqual([])
    props.page = 80
    props.seeking = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(199)
    expect(imagePages(element)).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(imagePages(element)).toEqual([78, 79, 80, 81, 82])
  })

  it("鼠标拖动不吸附，暂停期间不加载，滑远后卸载窗口外的图片但保留窗口内的节点", async () => {
    const { element, change, draggingChange } = await setup()
    await vi.advanceTimersByTimeAsync(200)
    const firstImage = element.querySelector("img")
    element.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", clientX: 500 }),
    )
    expect(draggingChange).toHaveBeenLastCalledWith(true)
    element.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: -6550 }))
    element.dispatchEvent(new Event("scroll"))
    expect(element.scrollLeft).toBe(7050)
    expect(change).toHaveBeenLastCalledWith(11)
    await vi.advanceTimersByTimeAsync(1000)
    expect(imagePages(element)).toEqual([1, 2, 3])
    element.dispatchEvent(new PointerEvent("pointerup"))
    expect(draggingChange).toHaveBeenLastCalledWith(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(imagePages(element)).toEqual([1, 2, 3, 9, 10, 11, 12, 13, 14])
    expect(element.scrollLeft).toBe(7050)
    expect(element.querySelector("img")).toBe(firstImage)
    element.scrollLeft = 0
    element.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(200)
    /* 回到首页后第 14 页已经超出保留窗口而卸载，窗口内的节点不重建。 */
    expect(imagePages(element)).toEqual([1, 2, 3, 9, 10, 11, 12, 13])
    expect(element.querySelector("img")).toBe(firstImage)
  })

  it("触屏保留原生滚动与惯性，不抢占指针或模拟鼠标位移", async () => {
    const { element } = await setup()
    const event = new PointerEvent("pointerdown", {
      button: 0,
      pointerId: 2,
      pointerType: "touch",
      clientX: 500,
      cancelable: true,
    })
    element.dispatchEvent(event)
    element.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 100 }))
    expect(event.defaultPrevented).toBe(false)
    expect(element.setPointerCapture).not.toHaveBeenCalled()
    expect(element.scrollLeft).toBe(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(imagePages(element)).toEqual([])
    element.dispatchEvent(new PointerEvent("pointerup"))
    element.scrollLeft = 700
    element.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(50)
    element.scrollLeft = 1400
    element.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(199)
    expect(imagePages(element)).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(imagePages(element)).toEqual([1, 2, 3, 4, 5])
  })

  it("同批图片变成真实宽度时保留视口锚点，横屏调整仍定位当前页", async () => {
    const { element } = await setup(4)
    await vi.advanceTimersByTimeAsync(200)
    loadImage(element, 2, 1000, 1000)
    loadImage(element, 3, 500, 1000)
    await nextTick()
    expect(element.scrollLeft).toBe(1900)
    resize([{ contentRect: { width: 700, height: 500 } }])
    await nextTick()
    expect(element.scrollLeft).toBe(925)
  })

  it("宽屏同时显示多页时，拖到两端仍正确标记首页与末页", async () => {
    const { element, change } = await setup(50)
    resize([{ contentRect: { width: 2100, height: 1000 } }])
    await nextTick()
    element.dispatchEvent(new Event("scroll"))
    element.scrollLeft = 67900
    element.dispatchEvent(new Event("scroll"))
    expect(change).toHaveBeenLastCalledWith(100)
    element.scrollLeft = 0
    element.dispatchEvent(new Event("scroll"))
    expect(change).toHaveBeenLastCalledWith(1)
  })

  it("失败仅影响当前图片，重试单独换地址，不设加载失败计时", async () => {
    const { element } = await setup(5)
    await vi.advanceTimersByTimeAsync(60000)
    expect(element.querySelector("button")).toBeNull()
    const page = element.children[4]!
    const original = page.querySelector("img")!
    original.dispatchEvent(new Event("error"))
    await nextTick()
    expect(page.textContent).toContain("第 5 页加载失败")
    page.querySelector("button")!.click()
    await nextTick()
    expect(page.querySelector("button")).toBeNull()
    expect(page.querySelector("img")).not.toBe(original)
    expect(page.querySelector("img")!.getAttribute("src")).toBe("/image/5?signed=true&r=1")
    expect(imagePages(element)).toEqual([3, 4, 5, 6, 7])
  })

  it("卸载时取消尚未触发的延迟加载与待执行跳转", async () => {
    const { props, element } = await setup(70)
    await vi.advanceTimersByTimeAsync(200)
    expect(imagePages(element)).toEqual([68, 69, 70, 71, 72])
    props.page = 80
    await nextTick()
    const scrolls = vi.mocked(element.scrollTo).mock.calls.length
    app!.unmount()
    app = undefined
    await vi.advanceTimersByTimeAsync(200)
    expect(element.scrollTo).toHaveBeenCalledTimes(scrolls)
    expect(imagePages(element)).toEqual([68, 69, 70, 71, 72])
  })
})
