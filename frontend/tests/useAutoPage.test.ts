/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, ref } from "vue"

import { useAutoPage } from "@/composables/useAutoPage"

const scopes: ReturnType<typeof effectScope>[] = []

function createReader(userId: number | undefined = 1) {
  const state = { identity: ref("1/token"), page: ref(1), total: ref(10), dragging: ref(false) }
  const goTo = vi.fn((page: number) => {
    state.page.value = page
  })
  const scope = effectScope()
  scopes.push(scope)
  const auto = scope.run(() => useAutoPage(state, goTo, userId))!
  return { state, goTo, scope, auto }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
})
afterEach(() => {
  for (const scope of scopes.splice(0)) {
    scope.stop()
  }
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("自动翻页", () => {
  it("默认关闭，开始后等待完整间隔，手动换页不改变节奏，暂停后不再前进", async () => {
    const { state, goTo, auto } = createReader()
    await vi.advanceTimersByTimeAsync(10000)
    expect(goTo).not.toHaveBeenCalled()
    auto.toggle()
    await vi.advanceTimersByTimeAsync(3000)
    state.page.value = 4
    await vi.advanceTimersByTimeAsync(1999)
    expect(goTo).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(goTo).toHaveBeenLastCalledWith(5)
    await vi.advanceTimersByTimeAsync(5000)
    expect(goTo).toHaveBeenLastCalledWith(6)
    auto.toggle()
    await vi.advanceTimersByTimeAsync(10000)
    expect(goTo).toHaveBeenCalledTimes(2)
  })

  it("拖动期间避让，结束后重新等待完整间隔", async () => {
    const { state, goTo, auto } = createReader()
    auto.toggle()
    await vi.advanceTimersByTimeAsync(4000)
    state.dragging.value = true
    await vi.advanceTimersByTimeAsync(10000)
    expect(auto.active.value).toBe(true)
    expect(goTo).not.toHaveBeenCalled()
    state.page.value = 3
    state.dragging.value = false
    await vi.advanceTimersByTimeAsync(4999)
    expect(goTo).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(goTo).toHaveBeenCalledExactlyOnceWith(4)
  })

  it("修改间隔立即重新计时，按账号保存间隔但不保存开启状态", async () => {
    const { goTo, auto } = createReader()
    auto.toggle()
    await vi.advanceTimersByTimeAsync(4000)
    auto.setInterval(20)
    await vi.advanceTimersByTimeAsync(19999)
    expect(goTo).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(goTo).toHaveBeenCalledTimes(1)
    const reopened = createReader()
    expect(reopened.auto.interval.value).toBe(20)
    expect(reopened.auto.active.value).toBe(false)
    expect(createReader(2).auto.interval.value).toBe(5)
    auto.setInterval(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(goTo).toHaveBeenCalledTimes(2)
  })

  it("没有页数或已到末页不能启动，到达末页立即停止且不循环", async () => {
    const { state, goTo, auto } = createReader()
    state.total.value = 0
    auto.toggle()
    expect(auto.active.value).toBe(false)
    state.total.value = 2
    auto.toggle()
    await vi.advanceTimersByTimeAsync(5000)
    expect(state.page.value).toBe(2)
    expect(auto.active.value).toBe(false)
    auto.toggle()
    await vi.advanceTimersByTimeAsync(10000)
    expect(goTo).toHaveBeenCalledTimes(1)
  })

  it("切入后台停止，回来需要手动启动；换图集同样停止", async () => {
    const { state, goTo, auto } = createReader()
    await nextTick()
    auto.toggle()
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(auto.active.value).toBe(false)
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(10000)
    expect(goTo).not.toHaveBeenCalled()
    auto.toggle()
    state.identity.value = "2/other"
    expect(auto.active.value).toBe(false)
    await vi.advanceTimersByTimeAsync(10000)
    expect(goTo).not.toHaveBeenCalled()
  })

  it("离开停止或卸载后清除计时器", async () => {
    const { goTo, scope, auto } = createReader()
    auto.toggle()
    auto.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(goTo).not.toHaveBeenCalled()
    auto.toggle()
    scope.stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(goTo).not.toHaveBeenCalled()
  })

  it.each([0, 21, 1.5, "10", null])("非法存储值 %s 使用默认间隔", (value) => {
    localStorage.setItem("myapi.reader-interval.1", JSON.stringify(value))
    expect(createReader().auto.interval.value).toBe(5)
  })
})
