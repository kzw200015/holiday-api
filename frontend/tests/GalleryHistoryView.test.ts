/* @vitest-environment happy-dom */
import { VueQueryPlugin } from "@tanstack/vue-query"
import type * as VueUse from "@vueuse/core"
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, KeepAlive, nextTick } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import type * as EhApi from "@/api/eh"
import {
  clearReadingHistory,
  fetchReadingHistory,
  removeReadingHistory,
  type GalleryCard,
  type ReadingHistoryPage,
} from "@/api/eh"
import { createQueryClient } from "@/api/queryClient"
import { useAuthStore } from "@/stores/AuthStore"
import GalleryHistoryView from "@/views/GalleryHistoryView.vue"

/* 触底加载靠滚动位置触发，happy-dom 不做布局，所以把入口接出来手动调用。 */
const scroll = vi.hoisted(() => ({
  load: () => {},
  target: (): Window | null => null,
  canLoad: (): boolean => false,
}))

vi.mock("@vueuse/core", async (original) => ({
  ...(await original<typeof VueUse>()),
  useInfiniteScroll: (target: () => Window | null, load: () => void, options: { canLoadMore: () => boolean }) => {
    scroll.target = target
    scroll.load = load
    scroll.canLoad = options.canLoadMore
  },
}))
vi.mock("@/api/eh", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchReadingHistory: vi.fn(),
  removeReadingHistory: vi.fn(),
  clearReadingHistory: vi.fn(),
}))

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof createApp> | undefined
let router: ReturnType<typeof createRouter>
let host: HTMLDivElement
const loadHistory = vi.mocked(fetchReadingHistory)

function gallery(gid: number): GalleryCard {
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

function page(gid: number, nextCursor: string | null): ReadingHistoryPage {
  return {
    items: [{ gid, token: `token${gid}`, page: gid, readAt: "2026-09-05T00:00:00Z", gallery: gallery(gid) }],
    nextCursor,
  }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

async function mountHistory() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/eh/history", component: GalleryHistoryView },
      { path: "/away", component: { render: () => h("div", "其他页面") } },
      { path: "/eh/g/:gid/:token", name: "gallery-detail", component: { render: () => h("div") } },
      { path: "/eh/read/:gid/:token/:page?", name: "reader", component: { render: () => h("div") } },
    ],
  })
  await router.push("/eh/history")
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
            h(KeepAlive, { include: "GalleryHistoryView" }, { default: () => h(Component) }),
        },
      ),
  })
  pinia = createPinia()
  app.use(router)
  app.use(pinia)
  app.use(VueQueryPlugin, { queryClient: createQueryClient() })
  useAuthStore(pinia).user = { id: 1, username: "tester" }
  app.mount(host)
  await settle()
}

function titles() {
  return [...host.querySelectorAll("a[href^='/eh/g/']")].map((node) => node.textContent?.match(/图集 \d+/)?.[0])
}
async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLElement>("button")].find((node) => node.textContent?.trim() === text)
  expect(button, `${text}: ${host.textContent}`).toBeDefined()
  button!.click()
  await settle()
}

beforeEach(() => {
  vi.clearAllMocks()
  loadHistory.mockReset().mockResolvedValue(page(1, null))
  vi.mocked(removeReadingHistory).mockResolvedValue(null)
  vi.mocked(clearReadingHistory).mockResolvedValue(null)
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
})
afterEach(() => {
  app?.unmount()
  disposePinia(pinia)
  host.remove()
  vi.restoreAllMocks()
})

describe("阅读历史分页", () => {
  it("触底续取下一页并累积到同一列表，到底后不再请求", async () => {
    loadHistory.mockResolvedValueOnce(page(1, "cursor-2")).mockResolvedValueOnce(page(2, null))
    await mountHistory()
    expect(titles()).toEqual(["图集 1"])
    expect(scroll.canLoad()).toBe(true)
    scroll.load()
    await settle()
    expect(loadHistory).toHaveBeenLastCalledWith("cursor-2", expect.any(AbortSignal))
    expect(titles()).toEqual(["图集 1", "图集 2"])
    expect(host.textContent).toContain("已经到底了")
    expect(scroll.canLoad()).toBe(false)
    scroll.load()
    await settle()
    expect(loadHistory).toHaveBeenCalledTimes(2)
  })

  it("续取失败后停下并保留已有条目，重试成功后继续", async () => {
    loadHistory.mockResolvedValueOnce(page(1, "cursor-2")).mockRejectedValueOnce(new Error("续取失败测试"))
    await mountHistory()
    scroll.load()
    await settle()
    expect(host.textContent).toContain("续取失败测试")
    expect(titles()).toEqual(["图集 1"])
    /* 失败后不再自动往下取，等用户点重试。 */
    expect(scroll.canLoad()).toBe(false)
    loadHistory.mockResolvedValueOnce(page(1, null))
    await click("重试")
    expect(host.textContent).not.toContain("续取失败测试")
    expect(titles()).toEqual(["图集 1"])
  })

  it("删除成功只改本地列表，不再重新拉页；失败保留条目", async () => {
    loadHistory.mockResolvedValueOnce(page(1, "cursor-2")).mockResolvedValueOnce(page(2, null))
    await mountHistory()
    scroll.load()
    await settle()
    vi.mocked(removeReadingHistory).mockRejectedValueOnce(new Error("删除失败测试"))
    await click("删除")
    expect(host.textContent).toContain("删除失败测试")
    expect(titles()).toEqual(["图集 1", "图集 2"])
    await click("删除")
    expect(titles()).toEqual(["图集 2"])
    expect(loadHistory).toHaveBeenCalledTimes(2)
  })

  it("页面停用后不再自动续取，重新激活会刷新列表", async () => {
    loadHistory.mockResolvedValue(page(1, "cursor-2"))
    await mountHistory()
    expect(scroll.target()).toBe(window)
    await router.push("/away")
    await settle()
    expect(scroll.target()).toBeNull()
    const loaded = loadHistory.mock.calls.length
    await router.push("/eh/history")
    await settle()
    expect(loadHistory.mock.calls.length).toBeGreaterThan(loaded)
    expect(scroll.target()).toBe(window)
  })
})
