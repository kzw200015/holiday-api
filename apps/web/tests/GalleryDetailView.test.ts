/* @vitest-environment happy-dom */
import type * as VueUse from "@vueuse/core"
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, h, toValue, type MaybeRefOrGetter } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import type * as EhApi from "@/features/eh/api"
import { fetchGalleryComments, fetchGalleryDetail, fetchGalleryPreviews, fetchReadingProgress } from "@/features/eh/api"
import { gallerySource } from "@/features/eh/navigation"
import GalleryDetailView from "@/features/eh/views/GalleryDetailView.vue"
import { installQueries } from "@/shared/api/queries"
import type { GalleryDetail } from "@server/eh/gallery-catalog"
import type { GalleryPreview } from "@server/eh/gallery.service"
import type { GalleryComment } from "@server/eh/upstream/parse"
import { byText, galleryCard, present, query, settle } from "./support"

/* 滚到哪一片才取哪一片靠 IntersectionObserver，happy-dom 不做布局，所以把观察的元素和回调接出来，由测试说哪里进了视口。 */
const observers = vi.hoisted(() => [] as { targets: () => Element[]; callback: (entries: unknown[]) => void }[])

vi.mock("@vueuse/core", async (original) => ({
  ...(await original<typeof VueUse>()),
  useIntersectionObserver: (
    target: MaybeRefOrGetter<Element | Element[] | null | undefined>,
    callback: (entries: unknown[]) => void,
  ) => {
    const observer = {
      targets: () => [toValue(target) ?? []].flat(),
      callback,
    }
    observers.push(observer)
    return {
      isSupported: true,
      isActive: true,
      pause: () => {},
      resume: () => {},
      stop: () => observers.splice(observers.indexOf(observer), 1),
    }
  },
}))
vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryDetail: vi.fn(),
  fetchGalleryComments: vi.fn(),
  fetchGalleryPreviews: vi.fn(),
  fetchReadingProgress: vi.fn(),
}))

const GID = 7
const TOKEN = "abcdef0123"
const SLICE_SIZE = 20

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof createApp> | undefined
let router: ReturnType<typeof createRouter>
let host: HTMLDivElement
const loadPreviews = vi.mocked(fetchGalleryPreviews)

function detail(fileCount: number): GalleryDetail {
  return { ...galleryCard(GID), token: TOKEN, fileCount, fileSize: 1, torrentCount: 0, expunged: false }
}

/** 第 slice 片的预览图：按每片 SLICE_SIZE 页切，最后一片到 fileCount 为止。 */
function sliceOf(slice: number, fileCount: number): GalleryPreview[] {
  const from = slice * SLICE_SIZE + 1
  const to = Math.min(fileCount, from + SLICE_SIZE - 1)
  return Array.from({ length: to - from + 1 }, (_, index) => ({
    page: from + index,
    url: `/thumb/${from + index}`,
    width: 100,
    height: 140,
    offsetX: 0,
    offsetY: 0,
  }))
}

function comment(id: number): GalleryComment {
  return {
    id,
    author: `作者${id}`,
    postedAt: "",
    isUploader: false,
    score: "",
    segments: [{ type: "text", text: `评论${id}` }],
  }
}

async function mountDetail({
  fileCount = 45,
  progress = null as number | null,
  comments = [] as GalleryComment[],
  source = "",
} = {}) {
  vi.mocked(fetchGalleryDetail).mockResolvedValue(detail(fileCount))
  vi.mocked(fetchReadingProgress).mockResolvedValue({ page: progress })
  vi.mocked(fetchGalleryComments).mockResolvedValue({ comments, hiddenCount: 0 })
  loadPreviews.mockImplementation(async (_gid, _token, slice) => sliceOf(slice, fileCount))
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/eh/g/:gid/:token",
        name: "gallery-detail",
        component: GalleryDetailView,
        props: (route) => ({
          gid: Number(route.params.gid),
          token: String(route.params.token),
          source: gallerySource(route.query),
        }),
      },
      { path: "/eh/g/:gid/:token/comments", name: "gallery-comments", component: { render: () => h("div") } },
      { path: "/eh/read/:gid/:token/:page?", name: "reader", component: { render: () => h("div") } },
    ],
  })
  await router.push(`/eh/g/${GID}/${TOKEN}${source}`)
  await router.isReady()
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(RouterView) })
  pinia = createPinia()
  app.use(router)
  app.use(pinia)
  installQueries(app)
  app.mount(host)
  await settle()
}

/** 预览里第 page 页的那一格。 */
const cell = (page: number) => query<HTMLAnchorElement>(host, `a[aria-label="第 ${page} 页"]`)

/* 与 GalleryPreviewSlice 里的 DWELL 对齐：格子在视口附近停够这么久，那一片才去取。 */
const DWELL = 200

/** 第 page 页那一格进出视口。 */
function intersect(page: number, isIntersecting: boolean) {
  const target = cell(page)
  const observer = present(
    observers.find((candidate) => candidate.targets().includes(target)),
    `观察第 ${page} 页的 IntersectionObserver`,
  )
  observer.callback([{ isIntersecting, target }])
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 让第 page 页那一格进入视口并停够时间。 */
async function reveal(page: number) {
  intersect(page, true)
  await wait(DWELL + 50)
  await settle()
}

const requestedSlices = () => loadPreviews.mock.calls.map(([, , slice]) => slice)

beforeEach(() => {
  loadPreviews.mockReset()
  observers.length = 0
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  disposePinia(pinia)
})

describe("预览图", () => {
  it("一打开就摆出全部页码的占位，只取第一片", async () => {
    await mountDetail({ fileCount: 45 })
    expect(host.querySelectorAll('a[aria-label^="第 "]')).toHaveLength(45)
    expect(requestedSlices()).toEqual([0])
    expect(cell(1).querySelector("img")?.getAttribute("src")).toBe("/thumb/1")
    expect(cell(21).querySelector("img")).toBeNull()
  })

  it("哪一片进了视口才取哪一片", async () => {
    await mountDetail({ fileCount: 65 })
    await reveal(50)
    expect(requestedSlices()).toEqual([0, 2])
    expect(cell(50).querySelector("img")?.getAttribute("src")).toBe("/thumb/50")
    expect(cell(30).querySelector("img")).toBeNull()
  })

  it("快速滚过去、没在视口附近停够时间的那一片不取", async () => {
    await mountDetail({ fileCount: 65 })
    intersect(30, true)
    await wait(DWELL / 2)
    intersect(30, false)
    await wait(DWELL + 50)
    await settle()
    expect(requestedSlices()).toEqual([0])
  })

  it("点哪一格就从哪一页开始读，图还没出来也能点，来源列表一路带着", async () => {
    await mountDetail({ fileCount: 45, source: "?source=history" })
    cell(30).click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe(`/eh/read/${GID}/${TOKEN}/30?source=history`)
  })

  it("某一片没取到，就在那一片的位置给重试，其余照常", async () => {
    await mountDetail({ fileCount: 45 })
    loadPreviews.mockRejectedValueOnce(new Error("e 站那边出错了"))
    await reveal(30)
    expect(cell(30).querySelector("img")).toBeNull()
    expect(cell(1).querySelector("img")).not.toBeNull()
    byText(host, "button", "第 21–40 页没取到，重试").click()
    await settle()
    expect(requestedSlices()).toEqual([0, 1, 1])
    expect(cell(30).querySelector("img")?.getAttribute("src")).toBe("/thumb/30")
    expect(host.textContent).not.toContain("没取到")
  })

  it("读到的那一页标出来，还没取到那一片也标", async () => {
    await mountDetail({ fileCount: 45, progress: 30 })
    expect(cell(30).textContent).toContain("读到这里")
    expect([cell(29), cell(1)].map((link) => link.textContent)).not.toContain(expect.stringContaining("读到这里"))
  })
})

describe("评论", () => {
  const shown = () =>
    [...host.querySelectorAll("p, span, div")]
      .filter((node) => /^评论\d+$/.test(node.textContent?.trim() ?? "") && node.children.length === 0)
      .map((node) => node.textContent?.trim())

  it("只列前 5 条，多出来的去评论页看，来源列表一路带着", async () => {
    await mountDetail({ comments: [1, 2, 3, 4, 5, 6, 7].map(comment), source: "?source=history" })
    expect(shown()).toEqual(["评论1", "评论2", "评论3", "评论4", "评论5"])
    byText(host, "a", "查看全部 7 条评论").click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe(`/eh/g/${GID}/${TOKEN}/comments?source=history`)
  })

  it("不超过 5 条就不给评论页的入口", async () => {
    await mountDetail({ comments: [1, 2, 3, 4, 5].map(comment) })
    expect(shown()).toHaveLength(5)
    expect(host.textContent).not.toContain("查看全部")
  })
})
