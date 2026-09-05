// @vitest-environment happy-dom
import { effectScope, nextTick, reactive, type EffectScope } from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useReaderStrip } from "@/composables/useReaderStrip"

let resize: (entries: { contentRect: { width: number; height: number } }[]) => void
vi.mock("@vueuse/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@vueuse/core")>(),
  useResizeObserver: vi.fn((_target, callback) => { resize = callback }),
}))
let scope: EffectScope
beforeEach(() => { vi.useFakeTimers(); scope = effectScope() })
afterEach(() => { scope.stop(); vi.useRealTimers() })

async function setup(page = 1) {
  const props = reactive({ page, total: 100, seeking: false })
  const change = vi.fn((page: number) => { props.page = page })
  const strip = scope.run(() => useReaderStrip(props, change))!
  const element = document.createElement("div")
  element.setPointerCapture = vi.fn()
  strip.viewport.value = element
  resize([{ contentRect: { width: 700, height: 1000 } }])
  await nextTick()
  strip.onScroll()
  return { props, strip, element, change }
}

describe("横向阅读延迟加载", () => {
  it("停留200毫秒后才加载可见页和两侧各两页，长图集不一次加载全部", async () => {
    const { strip } = await setup(20)
    await vi.advanceTimersByTimeAsync(199)
    expect(strip.loaded.value.size).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect([...strip.loaded.value]).toEqual([18, 19, 20, 21, 22])
    expect(strip.widths.value).toHaveLength(100)
  })

  it("连续跳页取消途中加载；进度条按住不加载，松手后重新计时", async () => {
    const { props, strip } = await setup()
    props.seeking = true
    props.page = 30
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(strip.loaded.value.size).toBe(0)
    props.page = 80
    props.seeking = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(199)
    expect(strip.loaded.value.size).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect([...strip.loaded.value]).toEqual([78, 79, 80, 81, 82])
  })

  it("鼠标拖动不吸附，暂停期间不加载，停稳后释放远处图片", async () => {
    const { strip, element, change } = await setup()
    await vi.advanceTimersByTimeAsync(200)
    strip.onPointerDown(new PointerEvent("pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", clientX: 500 }))
    strip.onPointerMove(new PointerEvent("pointermove", { pointerId: 1, clientX: -6550 }))
    strip.onScroll()
    expect(element.scrollLeft).toBe(7050)
    expect(change).toHaveBeenLastCalledWith(11)
    await vi.advanceTimersByTimeAsync(1000)
    expect([...strip.loaded.value]).toEqual([1, 2, 3])
    strip.onPointerEnd()
    await vi.advanceTimersByTimeAsync(200)
    expect([...strip.loaded.value]).toEqual([9, 10, 11, 12, 13, 14])
    expect(element.scrollLeft).toBe(7050)
  })

  it("触屏保留原生滚动与惯性，不抢占指针或模拟鼠标位移", async () => {
    const { strip, element } = await setup()
    const event = new PointerEvent("pointerdown", { button: 0, pointerId: 2, pointerType: "touch", clientX: 500, cancelable: true })
    strip.onPointerDown(event)
    strip.onPointerMove(new PointerEvent("pointermove", { pointerId: 2, clientX: 100 }))
    expect(event.defaultPrevented).toBe(false)
    expect(element.setPointerCapture).not.toHaveBeenCalled()
    expect(element.scrollLeft).toBe(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(strip.loaded.value.size).toBe(0)
    strip.onPointerEnd()
    element.scrollLeft = 700
    strip.onScroll()
    await vi.advanceTimersByTimeAsync(50)
    element.scrollLeft = 1400
    strip.onScroll()
    await vi.advanceTimersByTimeAsync(199)
    expect(strip.loaded.value.size).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect([...strip.loaded.value]).toEqual([1, 2, 3, 4, 5])
  })

  it("同批图片变成真实宽度时保留视口锚点，横屏调整仍定位当前页", async () => {
    const { strip, element } = await setup(4)
    await Promise.all([
      strip.imageLoaded(2, { naturalWidth: 1000, naturalHeight: 1000 } as HTMLImageElement),
      strip.imageLoaded(3, { naturalWidth: 500, naturalHeight: 1000 } as HTMLImageElement),
    ])
    expect(element.scrollLeft).toBe(2200)
    resize([{ contentRect: { width: 700, height: 500 } }])
    await nextTick()
    expect(element.scrollLeft).toBe(925)
  })

  it("宽屏同时显示多页时，拖到两端仍正确标记首页与末页", async () => {
    const { strip, element, change } = await setup(50)
    resize([{ contentRect: { width: 2100, height: 1000 } }])
    await nextTick()
    strip.onScroll()
    element.scrollLeft = 67900
    strip.onScroll()
    expect(change).toHaveBeenLastCalledWith(100)
    element.scrollLeft = 0
    strip.onScroll()
    expect(change).toHaveBeenLastCalledWith(1)
  })

  it("失败仅影响当前图片，重试单独换地址，不设加载失败计时", async () => {
    const { strip } = await setup(5)
    await vi.advanceTimersByTimeAsync(60000)
    expect(strip.failed.value.size).toBe(0)
    strip.failed.value.add(5)
    strip.retry(5)
    expect(strip.failed.value.has(5)).toBe(false)
    expect(strip.nonces.value).toEqual({ 5: 1 })
  })

  it("卸载时取消尚未触发的延迟加载", async () => {
    const { props, strip } = await setup(70)
    await vi.advanceTimersByTimeAsync(200)
    expect([...strip.loaded.value]).toEqual([68, 69, 70, 71, 72])
    props.page = 80
    await nextTick()
    scope.stop()
    await vi.advanceTimersByTimeAsync(200)
    expect([...strip.loaded.value]).toEqual([68, 69, 70, 71, 72])
  })
})
