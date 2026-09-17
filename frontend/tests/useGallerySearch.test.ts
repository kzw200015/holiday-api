/* @vitest-environment happy-dom */
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, KeepAlive, nextTick } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import type * as EhApi from "@/api/eh"
import {
  clearSearchHistory,
  fetchGalleryPreferences,
  fetchSearchHistory,
  recordSearch,
  removeSearch,
  searchGalleries,
} from "@/api/eh"
import GalleryListView from "@/views/GalleryListView.vue"

vi.mock("@/api/eh", async (original) => ({
  ...(await original<typeof EhApi>()),
  searchGalleries: vi.fn(),
  fetchGalleryPreferences: vi.fn(),
  fetchSearchHistory: vi.fn(),
  recordSearch: vi.fn(),
  removeSearch: vi.fn(),
  clearSearchHistory: vi.fn(),
}))

let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
let pinia: ReturnType<typeof createPinia>
const onSearch = vi.mocked(searchGalleries)

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

async function mountForm() {
  host = document.createElement("div")
  document.body.append(host)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/eh", component: GalleryListView }] })
  await router.push("/eh")
  await router.isReady()
  app = createApp({
    render: () =>
      h(
        RouterView,
        {},
        {
          default: ({ Component }: { Component: ReturnType<typeof h> }) =>
            h(KeepAlive, {}, { default: () => h(Component) }),
        },
      ),
  })
  pinia = createPinia()
  app.use(pinia)
  app.use(router)
  app.mount(host)
  await settle()
}

async function submit(keyword: string) {
  const input = host.querySelector("input")!
  input.value = keyword
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  await settle()
}

async function clearHistory() {
  const trigger = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "清空")!
  trigger.click()
  await settle()
  const confirm = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "清空历史")!
  confirm.click()
  await settle()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  onSearch.mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], readerInterval: 5 })
  vi.mocked(fetchSearchHistory).mockResolvedValue(["cat"])
  vi.mocked(recordSearch).mockResolvedValue(["dog", "cat"])
  vi.mocked(removeSearch).mockResolvedValue(["dog"])
  vi.mocked(clearSearchHistory).mockResolvedValue(null)
})
afterEach(() => {
  app?.unmount()
  host.remove()
  disposePinia(pinia)
  vi.restoreAllMocks()
})

describe("图库搜索流程", () => {
  it("首次激活只读取一次，恢复分类不提交关键词或保存历史", async () => {
    await mountForm()
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(1)
    expect(fetchSearchHistory).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(
      { keyword: "", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    expect(recordSearch).not.toHaveBeenCalled()
    expect(host.querySelector('[title="cat"]')).not.toBeNull()
  })

  it("提交搜索与历史操作由组件处理，删除和清空不触发搜索", async () => {
    await mountForm()
    await submit("   ")
    expect(recordSearch).not.toHaveBeenCalled()
    await submit(" dog ")
    expect(recordSearch).toHaveBeenCalledExactlyOnceWith("dog", expect.any(AbortSignal))
    expect(onSearch).toHaveBeenLastCalledWith(
      { keyword: "dog", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    expect(host.querySelector('[title="dog"]')).not.toBeNull()
    host.querySelector<HTMLButtonElement>('[aria-label="删除历史：cat"]')!.click()
    await settle()
    expect(removeSearch).toHaveBeenCalledExactlyOnceWith("cat", expect.any(AbortSignal))
    expect(host.querySelector('[title="cat"]')).toBeNull()
    await clearHistory()
    expect(clearSearchHistory).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal))
    expect(host.textContent).toContain("暂无搜索历史")
    expect(onSearch).toHaveBeenCalledTimes(2)
  })

  it("保存和清空失败保留已确认历史，错误不阻止本次搜索", async () => {
    await mountForm()
    vi.mocked(recordSearch).mockRejectedValue(new Error("断网"))
    await submit("dog")
    expect(onSearch).toHaveBeenLastCalledWith(
      { keyword: "dog", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    expect(host.querySelector('[title="cat"]')).not.toBeNull()
    expect(host.querySelector('[title="dog"]')).toBeNull()
    expect(host.textContent).toContain("搜索历史保存失败")
    expect(recordSearch).toHaveBeenCalledTimes(1)
    vi.mocked(clearSearchHistory).mockRejectedValue(new Error("断网"))
    await clearHistory()
    expect(host.textContent).toContain("清空搜索历史失败")
    expect(host.querySelector('[title="cat"]')).not.toBeNull()
  })

  it("历史查询与后续记录按序执行，查询不阻塞图集搜索", async () => {
    let resolve!: (value: string[]) => void
    vi.mocked(fetchSearchHistory).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    await mountForm()
    await submit("dog")
    expect(recordSearch).not.toHaveBeenCalled()
    expect(onSearch).toHaveBeenLastCalledWith(
      { keyword: "dog", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    resolve(["旧历史"])
    await settle()
    expect(host.querySelector('[title="dog"]')).not.toBeNull()
    expect(host.querySelector('[title="旧历史"]')).toBeNull()
  })

  it("销毁时取消在途读取，不再向页面发送恢复查询", async () => {
    let resolve!: (value: EhApi.GalleryPreferences) => void
    vi.mocked(fetchGalleryPreferences).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    vi.mocked(fetchSearchHistory).mockReturnValue(new Promise(() => {}))
    await mountForm()
    app!.unmount()
    app = undefined
    expect(vi.mocked(fetchGalleryPreferences).mock.calls[0]![0]!.aborted).toBe(true)
    expect(vi.mocked(fetchSearchHistory).mock.calls[0]![0]!.aborted).toBe(true)
    resolve({ categories: ["manga"], readerInterval: 5 })
    await settle()
    expect(onSearch).not.toHaveBeenCalled()
  })
})
