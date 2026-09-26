/* @vitest-environment happy-dom */
import type * as VueUse from "@vueuse/core"
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, KeepAlive, nextTick } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import type * as EhApi from "@/features/eh/api"
import { fetchGalleryPreferences, searchGalleries } from "@/features/eh/api"
import GalleryListView from "@/features/eh/views/GalleryListView.vue"
import { installQueries } from "@/shared/api/queries"
import { byText, deferred, galleryCard, present, query, settle } from "./support"

const scroll = vi.hoisted(() => ({
  load: async () => {},
  target: (): Window | null => null,
  canLoad: (): boolean => false,
}))

vi.mock("@vueuse/core", async (original) => ({
  ...(await original<typeof VueUse>()),
  useInfiniteScroll: (
    target: () => Window | null,
    load: () => Promise<void>,
    options: { canLoadMore: () => boolean },
  ) => {
    scroll.target = target
    /* 真的 useInfiniteScroll 先问过 canLoadMore 才会触发加载，这里照做。 */
    scroll.load = async () => {
      if (target() && options.canLoadMore()) {
        await load()
      }
    }
    scroll.canLoad = options.canLoadMore
  },
}))
vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  searchGalleries: vi.fn(),
  fetchGalleryPreferences: vi.fn(),
  fetchSearchHistory: vi.fn().mockResolvedValue([]),
  addSearchKeyword: vi.fn().mockResolvedValue(undefined),
  patchGalleryPreferences: vi.fn().mockResolvedValue(undefined),
}))

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof createApp> | undefined
let router: ReturnType<typeof createRouter>
let host: HTMLDivElement
const search = vi.mocked(searchGalleries)
const criteria = { keyword: "language:chinese", categories: ["manga"], minRating: null }

async function mountList() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/eh", component: GalleryListView },
      { path: "/away", component: { render: () => h("div", "其他页面") } },
      { path: "/eh/g/:gid/:token", name: "gallery-detail", component: { render: () => h("div") } },
    ],
  })
  await router.push("/eh")
  await router.isReady()
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({
    render: () =>
      h(
        RouterView,
        {},
        {
          default: ({ Component }: { Component: ReturnType<typeof h> }) =>
            h(KeepAlive, { include: "GalleryListView" }, { default: () => h(Component) }),
        },
      ),
  })
  app.use(router)
  pinia = createPinia()
  app.use(pinia)
  installQueries(app)
  app.mount(host)
  await settle()
  search.mockClear()
}

async function submit(keyword = criteria.keyword) {
  const input = query(host, "input")
  input.value = keyword
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  query(host, "form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  await settle()
}

beforeEach(() => {
  vi.clearAllMocks()
  search.mockReset().mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], minRating: null, readerInterval: 5 })
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
})
afterEach(() => {
  app?.unmount()
  disposePinia(pinia)
  host.remove()
  vi.restoreAllMocks()
})

describe("图库列表分页", () => {
  it("翻页保留已提交条件，失败暂停触底加载，重试沿用失败游标", async () => {
    await mountList()
    search.mockResolvedValueOnce({ items: [galleryCard(1)], nextCursor: "next" })
    await submit()
    search.mockRejectedValueOnce(new Error("上游限速"))
    await scroll.load()
    await settle()
    expect(scroll.canLoad()).toBe(false)
    await scroll.load()
    expect(search).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain("上游限速")
    search.mockResolvedValueOnce({ items: [galleryCard(2)], nextCursor: null })
    const retry = byText(host, "button", "重试")
    retry.click()
    await settle()
    expect(search).toHaveBeenLastCalledWith({ ...criteria, cursor: "next" }, expect.any(AbortSignal))
    expect(host.textContent).toContain("图集 1")
    expect(host.textContent).toContain("图集 2")
    expect(host.textContent).toContain("已经到底了")
    expect(host.textContent).not.toContain("上游限速")
    await scroll.load()
    expect(search).toHaveBeenCalledTimes(3)
  })

  it("切换条件立即请求新结果，取消并忽略旧响应", async () => {
    await mountList()
    const old = deferred<EhApi.GallerySearchPage>()
    search.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [galleryCard(2)], nextCursor: null })
    await submit()
    await submit("new")
    expect(search.mock.calls[0]?.[1]?.aborted).toBe(true)
    old.resolve({ items: [galleryCard(1)], nextCursor: "old-next" })
    await settle()
    expect(host.textContent).toContain("图集 2")
    expect(host.textContent).not.toContain("图集 1")
    expect(scroll.canLoad()).toBe(false)
  })

  it("旧请求失败不影响新请求的加载状态", async () => {
    await mountList()
    const old = deferred<EhApi.GallerySearchPage>()
    const current = deferred<EhApi.GallerySearchPage>()
    search.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    await submit()
    await submit("new")
    old.reject(new Error("旧请求失败"))
    await settle()
    expect(host.textContent).not.toContain("旧请求失败")
    expect(host.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    current.resolve({ items: [galleryCard(2)], nextCursor: null })
    await settle()
    expect(host.querySelector('[data-slot="skeleton"]')).toBeNull()
    expect(host.textContent).toContain("图集 2")
  })

  it("停用时关闭触底监听，回来不重新搜索；提交的分类去掉重复并排好序", async () => {
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({
      categories: ["manga", "doujinshi", "manga"],
      minRating: null,
      readerInterval: 5,
    })
    await mountList()
    search.mockResolvedValue({ items: [galleryCard(1)], nextCursor: null })
    await submit("a|b")
    expect(search).toHaveBeenCalledExactlyOnceWith(
      { keyword: "a|b", categories: ["doujinshi", "manga"], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    await router.push("/away")
    await settle()
    expect(scroll.target()).toBeNull()
    await router.push("/eh")
    await settle()
    expect(scroll.target()).toBe(window)
    expect(search).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain("图集 1")
  })

  it("同一页加载中再次触底不会重复请求", async () => {
    await mountList()
    const pending = deferred<EhApi.GallerySearchPage>()
    search.mockReturnValue(pending.promise)
    await submit()
    expect(scroll.canLoad()).toBe(false)
    await scroll.load()
    expect(search).toHaveBeenCalledTimes(1)
    pending.resolve({ items: [], nextCursor: null })
    await settle()
    expect(host.textContent).toContain("没有找到符合条件的图集")
  })

  it("销毁后迟到的响应不能恢复列表", async () => {
    await mountList()
    const pending = deferred<EhApi.GallerySearchPage>()
    search.mockReturnValueOnce(pending.promise)
    await submit()
    present(app, "应用").unmount()
    app = undefined
    pending.resolve({ items: [galleryCard(1)], nextCursor: "next" })
    await settle()
    expect(host.textContent).toBe("")
  })

  /* 重按搜索就是想看有没有新的：已经往下翻过的，只从第一页重来，不把翻过的每一页都向上游重抓一遍。 */
  it("翻过几页后重按同一个搜索，只重读第一页", async () => {
    await mountList()
    search.mockResolvedValueOnce({ items: [galleryCard(1)], nextCursor: "next" })
    await submit()
    search.mockResolvedValueOnce({ items: [galleryCard(2)], nextCursor: null })
    await scroll.load()
    await settle()
    expect(host.textContent).toContain("图集 2")
    search.mockClear()
    search.mockResolvedValueOnce({ items: [galleryCard(3)], nextCursor: "next" })
    await submit()
    expect(search).toHaveBeenCalledExactlyOnceWith({ ...criteria, cursor: "" }, expect.any(AbortSignal))
    expect(host.textContent).toContain("图集 3")
    expect(host.textContent).not.toContain("图集 2")
  })
})
