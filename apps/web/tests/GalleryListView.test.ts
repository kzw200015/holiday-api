/* @vitest-environment happy-dom */
import type { CursorPage, GalleryCard } from "@myapi/shared"
import type * as VueUse from "@vueuse/core"
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, KeepAlive, nextTick } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import type * as EhApi from "@/features/eh/api"
import { fetchGalleryPreferences, searchGalleries } from "@/features/eh/api"
import GalleryListView from "@/features/eh/views/GalleryListView.vue"

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
  saveSearchHistory: vi.fn().mockResolvedValue(null),
  saveGalleryPreferences: vi.fn().mockResolvedValue(null),
}))

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof createApp> | undefined
let router: ReturnType<typeof createRouter>
let host: HTMLDivElement
const search = vi.mocked(searchGalleries)
const query = { keyword: "language:chinese", categories: ["manga"] }

function card(gid: number): GalleryCard {
  return {
    gid,
    token: `token${gid}`,
    title: `图集 ${gid}`,
    titleJpn: "",
    category: "Manga",
    thumbnail: "/thumbnail",
    uploader: "tester",
    postedAt: "2026-09-05T00:00:00Z",
    fileCount: 10,
    rating: 4,
    tags: [],
  }
}

function deferredPage() {
  let resolve!: (value: CursorPage<GalleryCard>) => void
  let reject!: (error: Error) => void
  const promise = new Promise<CursorPage<GalleryCard>>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

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
  app.mount(host)
  await settle()
  search.mockClear()
}

async function submit(keyword = query.keyword) {
  const input = host.querySelector("input")!
  input.value = keyword
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  await settle()
}

beforeEach(() => {
  vi.clearAllMocks()
  search.mockReset().mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], readerInterval: 5 })
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
    search.mockResolvedValueOnce({ items: [card(1)], nextCursor: "next" })
    await submit()
    search.mockRejectedValueOnce(new Error("上游限速"))
    await scroll.load()
    await settle()
    expect(scroll.canLoad()).toBe(false)
    await scroll.load()
    expect(search).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain("上游限速")
    search.mockResolvedValueOnce({ items: [card(2)], nextCursor: null })
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "重试")!
    retry.click()
    await settle()
    expect(search).toHaveBeenLastCalledWith({ ...query, cursor: "next" }, expect.any(AbortSignal))
    expect(host.textContent).toContain("图集 1")
    expect(host.textContent).toContain("图集 2")
    expect(host.textContent).toContain("已经到底了")
    expect(host.textContent).not.toContain("上游限速")
    await scroll.load()
    expect(search).toHaveBeenCalledTimes(3)
  })

  it("切换条件立即请求新结果，取消并忽略旧响应", async () => {
    await mountList()
    const old = deferredPage()
    search.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [card(2)], nextCursor: null })
    await submit()
    await submit("new")
    expect(search.mock.calls[0]![1]?.aborted).toBe(true)
    old.resolve({ items: [card(1)], nextCursor: "old-next" })
    await settle()
    expect(host.textContent).toContain("图集 2")
    expect(host.textContent).not.toContain("图集 1")
    expect(scroll.canLoad()).toBe(false)
  })

  it("旧请求失败不影响新请求的加载状态", async () => {
    await mountList()
    const old = deferredPage()
    const current = deferredPage()
    search.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    await submit()
    await submit("new")
    old.reject(new Error("旧请求失败"))
    await settle()
    expect(host.textContent).not.toContain("旧请求失败")
    expect(host.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    current.resolve({ items: [card(2)], nextCursor: null })
    await settle()
    expect(host.querySelector('[data-slot="skeleton"]')).toBeNull()
    expect(host.textContent).toContain("图集 2")
  })

  it("停用时关闭触底监听，回来不重新搜索；提交的分类去掉重复、保留顺序", async () => {
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({
      categories: ["manga", "doujinshi", "manga"],
      readerInterval: 5,
    })
    await mountList()
    search.mockResolvedValue({ items: [card(1)], nextCursor: null })
    await submit("a|b")
    expect(search).toHaveBeenCalledExactlyOnceWith(
      { keyword: "a|b", categories: ["manga", "doujinshi"], cursor: "" },
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
    const pending = deferredPage()
    search.mockReturnValue(pending.promise)
    await submit()
    expect(scroll.canLoad()).toBe(false)
    await scroll.load()
    expect(search).toHaveBeenCalledTimes(1)
    pending.resolve({ items: [], nextCursor: null })
    await settle()
    expect(host.textContent).toContain("没有找到符合条件的图集")
  })

  it("销毁时取消在途请求，迟到响应不能恢复列表", async () => {
    await mountList()
    const pending = deferredPage()
    search.mockReturnValueOnce(pending.promise)
    await submit()
    app!.unmount()
    app = undefined
    expect(search.mock.calls[0]![1]?.aborted).toBe(true)
    pending.resolve({ items: [card(1)], nextCursor: "next" })
    await settle()
    expect(host.textContent).toBe("")
  })
})
