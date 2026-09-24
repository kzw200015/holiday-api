/* @vitest-environment happy-dom */
import { createPinia, disposePinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, KeepAlive, nextTick } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import type * as EhApi from "@/features/eh/api"
import {
  fetchGalleryPreferences,
  fetchSearchHistory,
  saveGalleryPreferences,
  saveSearchHistory,
  searchGalleries,
} from "@/features/eh/api"
import { useGalleryPreferencesStore, useSearchHistoryStore } from "@/features/eh/store"
import GalleryListView from "@/features/eh/views/GalleryListView.vue"
import { byText, query, settleFakeTimers } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  searchGalleries: vi.fn(),
  fetchGalleryPreferences: vi.fn(),
  fetchSearchHistory: vi.fn(),
  saveGalleryPreferences: vi.fn(),
  saveSearchHistory: vi.fn(),
}))

let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
let pinia: ReturnType<typeof createPinia>
const onSearch = vi.mocked(searchGalleries)

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
  setActivePinia(pinia)
  /* EhLayout 会先把这两份数据等齐再创建页面，这里照做：页面拿到的分类是确定的。 */
  await Promise.all([useGalleryPreferencesStore().load(), useSearchHistoryStore().load()])
  app.use(pinia)
  app.use(router)
  app.mount(host)
  await settleFakeTimers()
}

async function submit(keyword: string) {
  const input = query(host, "input")
  input.value = keyword
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  query(host, "form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  await settleFakeTimers()
}

/* 走真实控件：打开分类筛选、点几个分类、按应用。 */
async function applyCategories(...labels: string[]) {
  query<HTMLButtonElement>(host, '[aria-label="分类筛选"]').click()
  await settleFakeTimers()
  const click = (label: string) => byText(document, "button", label).click()
  labels.forEach(click)
  await settleFakeTimers()
  click("应用")
  await settleFakeTimers()
}

async function clearHistory() {
  const trigger = byText(host, "button", "清空")
  trigger.click()
  await settleFakeTimers()
  const confirm = byText(document, "button", "清空历史")
  confirm.click()
  await settleFakeTimers()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  onSearch.mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], readerInterval: 5 })
  vi.mocked(fetchSearchHistory).mockResolvedValue(["cat"])
  vi.mocked(saveSearchHistory).mockResolvedValue(null)
  vi.mocked(saveGalleryPreferences).mockResolvedValue(null)
})
afterEach(() => {
  app?.unmount()
  host.remove()
  disposePinia(pinia)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("图库搜索流程", () => {
  it("进来就按已备齐的分类搜一次，不记历史", async () => {
    await mountForm()
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(1)
    expect(fetchSearchHistory).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(
      { keyword: "", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    expect(saveSearchHistory).not.toHaveBeenCalled()
    expect(host.querySelector('[title="cat"]')).not.toBeNull()
  })

  it("搜索、删除、清空都当场改本地历史再整份推上去；删除和清空不触发搜索", async () => {
    await mountForm()
    await submit("   ")
    expect(saveSearchHistory).not.toHaveBeenCalled()

    await submit(" dog ")
    expect(host.querySelector('[title="dog"]')).not.toBeNull()
    expect(onSearch).toHaveBeenLastCalledWith(
      { keyword: "dog", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    expect(saveSearchHistory).toHaveBeenLastCalledWith(["dog", "cat"])

    query<HTMLButtonElement>(host, '[aria-label="删除历史：cat"]').click()
    await settleFakeTimers()
    expect(host.querySelector('[title="cat"]')).toBeNull()
    expect(saveSearchHistory).toHaveBeenLastCalledWith(["dog"])

    await clearHistory()
    expect(host.textContent).toContain("暂无搜索历史")
    expect(saveSearchHistory).toHaveBeenLastCalledWith([])
    /* 首屏一次、两次提交各一次；删除和清空历史都不搜索。 */
    expect(onSearch).toHaveBeenCalledTimes(3)
  })

  it("推送失败不动本地历史，也不拿失败打扰用户", async () => {
    await mountForm()
    vi.mocked(saveSearchHistory).mockRejectedValue(new Error("断网"))
    await submit("dog")
    expect(onSearch).toHaveBeenLastCalledWith(
      { keyword: "dog", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    await settleFakeTimers()
    /* 存不上也不回滚：界面上这一条就是有了。 */
    expect(host.querySelector('[title="dog"]')).not.toBeNull()
    expect(host.textContent).not.toContain("失败")
  })

  it("点历史词回填输入框并按当前分类搜索", async () => {
    await mountForm()
    onSearch.mockClear()
    query<HTMLButtonElement>(host, '[title="cat"]').click()
    await settleFakeTimers()
    expect(query(host, "input").value).toBe("cat")
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(
      { keyword: "cat", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
  })

  /* 分类改完立刻就要按新分类搜，中间不隔一次「还是旧条件」的请求。 */
  it("应用分类立刻按新分类搜一次", async () => {
    await mountForm()
    onSearch.mockClear()
    await applyCategories("同人志")
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(
      { keyword: "", categories: ["manga", "doujinshi"], cursor: "" },
      expect.any(AbortSignal),
    )
  })

  /* 失败后条件没变也必须真的重来一次，否则用户重按搜索时界面上没有任何反应。 */
  it("搜索失败后重新提交同一关键词仍会再搜一次", async () => {
    await mountForm()
    expect(onSearch).toHaveBeenCalledTimes(1)
    onSearch.mockRejectedValueOnce(new Error("断网"))
    await submit("dog")
    expect(onSearch).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain("断网")
    await submit("dog")
    expect(onSearch).toHaveBeenCalledTimes(3)
    expect(host.textContent).not.toContain("断网")
  })
})
