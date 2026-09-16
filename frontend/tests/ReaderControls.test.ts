/* @vitest-environment happy-dom */
import { createPinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, nextTick, reactive } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import ReaderControls from "@/components/gallery/ReaderControls.vue"
import { useAuthStore } from "@/stores/AuthStore"

const cleanups: (() => void)[] = []

async function createReader(userId: number | undefined = 1) {
  const state = reactive({ identity: "1/token", page: 1, total: 10, dragging: false, seeking: false, visible: true })
  const change = vi.fn((page: number) => {
    state.page = page
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/reader",
        component: {
          render: () =>
            h(ReaderControls, {
              key: state.identity,
              page: state.page,
              total: state.total,
              dragging: state.dragging,
              seeking: state.seeking,
              visible: state.visible,
              "onUpdate:page": change,
              "onUpdate:seeking": (value: boolean) => {
                state.seeking = value
              },
            }),
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

async function chooseInterval(host: HTMLElement, seconds: number) {
  const select = host.querySelector("select")!
  select.value = String(seconds)
  select.dispatchEvent(new Event("change", { bubbles: true }))
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
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

  it("图片拖动期间避让，结束后重新等待完整间隔", async () => {
    const { state, change, host } = await createReader()
    autoButton(host).click()
    await vi.advanceTimersByTimeAsync(4000)
    state.dragging = true
    await vi.advanceTimersByTimeAsync(10000)
    expect(autoButton(host).getAttribute("aria-pressed")).toBe("true")
    expect(change).not.toHaveBeenCalled()
    state.page = 3
    state.dragging = false
    await vi.advanceTimersByTimeAsync(4999)
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
    await chooseInterval(host, 20)
    await vi.advanceTimersByTimeAsync(19999)
    expect(change).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(change).toHaveBeenCalledTimes(1)
    const reopened = await createReader()
    expect(reopened.host.querySelector("select")!.value).toBe("20")
    expect(autoButton(reopened.host).getAttribute("aria-pressed")).toBe("false")
    const anotherUser = await createReader(2)
    expect(anotherUser.host.querySelector("select")!.value).toBe("5")
    await chooseInterval(host, 1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(change).toHaveBeenCalledTimes(2)
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

  it.each([0, 21, 1.5, "10", null])("非法存储值 %s 使用默认间隔", async (value) => {
    localStorage.setItem("myapi.reader-interval.1", JSON.stringify(value))
    const { host } = await createReader()
    expect(host.querySelector("select")!.value).toBe("5")
  })
})
