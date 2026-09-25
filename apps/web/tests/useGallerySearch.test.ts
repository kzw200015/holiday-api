/* @vitest-environment happy-dom */
import { useQueryCache } from "@pinia/colada"
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, KeepAlive, nextTick } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import type * as EhApi from "@/features/eh/api"
import {
  addSearchKeyword,
  clearSearchHistory,
  fetchGalleryPreferences,
  fetchSearchHistory,
  patchGalleryPreferences,
  removeSearchKeyword,
  searchGalleries,
} from "@/features/eh/api"
import { galleryCategories } from "@/features/eh/labels"
import { ehKeys, useEhWrites } from "@/features/eh/queries"
import GalleryListView from "@/features/eh/views/GalleryListView.vue"
import { installQueries } from "@/shared/api/queries"
import { byText, query, settleFakeTimers } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  searchGalleries: vi.fn(),
  fetchGalleryPreferences: vi.fn(),
  fetchSearchHistory: vi.fn(),
  patchGalleryPreferences: vi.fn(),
  addSearchKeyword: vi.fn(),
  removeSearchKeyword: vi.fn(),
  clearSearchHistory: vi.fn(),
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
  app.use(pinia)
  installQueries(app)
  /* EhLayout 会先等偏好读到再创建页面，这里照做：页面拿到的分类是确定的。 */
  useQueryCache(pinia).setQueryData(ehKeys.preferences, await fetchGalleryPreferences())
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

/* 走真实控件：打开筛选、点几个分类或评分档、按应用。 */
async function applyFilters(...labels: string[]) {
  query<HTMLButtonElement>(host, '[aria-label="筛选"]').click()
  await settleFakeTimers()
  const click = (label: string) => byText(document, "button", label).click()
  /* 每点一下都等它渲染完：组里的值要刷新过，下一下才是在它的基础上点 */
  for (const label of labels) {
    click(label)
    await settleFakeTimers()
  }
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
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], minRating: null, readerInterval: 5 })
  vi.mocked(fetchSearchHistory).mockResolvedValue(["cat"])
  vi.mocked(addSearchKeyword).mockResolvedValue(null)
  vi.mocked(removeSearchKeyword).mockResolvedValue(null)
  vi.mocked(clearSearchHistory).mockResolvedValue(null)
  vi.mocked(patchGalleryPreferences).mockResolvedValue(null)
})
afterEach(async () => {
  await useEhWrites(pinia).settled()
  app?.unmount()
  host.remove()
  disposePinia(pinia)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("图库搜索流程", () => {
  it("进来就按已备齐的分类搜一次，不记历史", async () => {
    await mountForm()
    expect(fetchSearchHistory).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(
      { keyword: "", categories: ["manga"], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    expect(addSearchKeyword).not.toHaveBeenCalled()
    expect(host.querySelector('[title="cat"]')).not.toBeNull()
  })

  it("搜索、删除、清空都当场改本地历史再逐个提交；删除和清空不触发搜索", async () => {
    await mountForm()
    await submit("   ")
    expect(addSearchKeyword).not.toHaveBeenCalled()

    await submit(" dog ")
    expect(host.querySelector('[title="dog"]')).not.toBeNull()
    expect(onSearch).toHaveBeenLastCalledWith(
      { keyword: "dog", categories: ["manga"], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    expect(host.querySelector('[title="cat"]')).not.toBeNull()
    expect(addSearchKeyword).toHaveBeenCalledExactlyOnceWith("dog")

    query<HTMLButtonElement>(host, '[aria-label="删除历史：cat"]').click()
    await settleFakeTimers()
    expect(host.querySelector('[title="cat"]')).toBeNull()
    expect(removeSearchKeyword).toHaveBeenCalledExactlyOnceWith("cat")

    await clearHistory()
    expect(host.textContent).toContain("暂无搜索历史")
    expect(clearSearchHistory).toHaveBeenCalledTimes(1)
    /* 首屏一次、两次提交各一次；删除和清空历史都不搜索。 */
    expect(onSearch).toHaveBeenCalledTimes(3)
  })

  it("提交失败就以服务端为准重读，也不拿失败打扰用户", async () => {
    await mountForm()
    vi.mocked(addSearchKeyword).mockRejectedValue(new Error("断网"))
    await submit("dog")
    expect(onSearch).toHaveBeenLastCalledWith(
      { keyword: "dog", categories: ["manga"], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    await settleFakeTimers()
    /* 服务端那份没有这个词，重读回来它就不在了 */
    expect(fetchSearchHistory).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[title="dog"]')).toBeNull()
    expect(host.textContent).not.toContain("失败")
  })

  /* 条件改完立刻就要按新条件搜，中间不隔一次「还是旧条件」的请求；偏好只提交筛选条件这几项。 */
  it("应用分类立刻按新分类搜一次", async () => {
    await mountForm()
    onSearch.mockClear()
    await applyFilters("同人志")
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(
      { keyword: "", categories: ["doujinshi", "manga"], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    expect(patchGalleryPreferences).toHaveBeenCalledExactlyOnceWith({
      categories: ["doujinshi", "manga"],
      minRating: null,
    })
  })

  it("应用最低评分立刻按它搜一次；按钮数的是生效的条件项数，重置把分类和评分一起清掉", async () => {
    await mountForm()
    expect(host.textContent).toContain("筛选 (1)")
    onSearch.mockClear()
    await applyFilters("4 星")
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(
      { keyword: "", categories: ["manga"], minRating: 4, cursor: "" },
      expect.any(AbortSignal),
    )
    expect(patchGalleryPreferences).toHaveBeenCalledExactlyOnceWith({ categories: ["manga"], minRating: 4 })
    expect(host.textContent).toContain("筛选 (2)")

    await applyFilters("重置")
    expect(onSearch).toHaveBeenLastCalledWith(
      { keyword: "", categories: [], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    expect(host.textContent).not.toContain("筛选 (")

    /* 全选分类等于不限，不算一项 */
    await applyFilters(...galleryCategories.map((category) => category.label))
    expect(onSearch).toHaveBeenLastCalledWith(
      { keyword: "", categories: galleryCategories.map((category) => category.value), minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    expect(host.textContent).not.toContain("筛选 (")
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
