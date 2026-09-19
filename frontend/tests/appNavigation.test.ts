// @vitest-environment happy-dom
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, nextTick, type App as VueApp } from "vue"
import { createRouter, createWebHistory, type Router } from "vue-router"

import { authenticate } from "@/api/auth"
import type * as EhApi from "@/api/eh"
import {
  bindCredential,
  clearReadingHistory,
  clearSearchHistory,
  fetchCredentialStatus,
  fetchGalleryComments,
  fetchGalleryDetail,
  fetchGalleryPreferences,
  fetchReadingHistory,
  fetchSearchHistory,
  recordSearch,
  removeReadingHistory,
  removeSearch,
  saveGalleryCategories,
  saveProgress,
  saveReaderInterval,
  searchGalleries,
  unbindCredential,
  type GalleryDetail,
} from "@/api/eh"
import { fetchHolidayDetail } from "@/api/holiday"
import App from "@/App.vue"
import { AppRouter } from "@/router"
import { useAuthStore } from "@/stores/AuthStore"
import { useEhStore } from "@/stores/EhStore"

vi.mock("@/api/auth", () => ({ authenticate: vi.fn(), fetchCurrentUser: vi.fn() }))
vi.mock("@/api/holiday", () => ({ fetchHolidayDetail: vi.fn() }))
vi.mock("@/api/eh", async (original) => ({
  ...(await original<typeof EhApi>()),
  bindCredential: vi.fn(),
  fetchReadingHistory: vi.fn(),
  removeReadingHistory: vi.fn(),
  clearReadingHistory: vi.fn(),
  fetchCredentialStatus: vi.fn(),
  unbindCredential: vi.fn(),
  fetchGalleryComments: vi.fn(),
  fetchGalleryDetail: vi.fn(),
  saveProgress: vi.fn(),
  searchGalleries: vi.fn(),
  fetchGalleryPreferences: vi.fn(),
  fetchSearchHistory: vi.fn(),
  recordSearch: vi.fn(),
  removeSearch: vi.fn(),
  clearSearchHistory: vi.fn(),
  saveGalleryCategories: vi.fn(),
  saveReaderInterval: vi.fn(),
}))

const gallery: GalleryDetail = {
  gid: 1,
  token: "aaaaaaaaaa",
  title: "测试图集",
  titleJpn: "",
  category: "Manga",
  thumbnail: "/thumbnail",
  uploader: "作者",
  postedAt: "2026-09-05T00:00:00Z",
  fileCount: 100,
  rating: 4,
  tags: [],
  fileSize: 100,
  torrentCount: 0,
  expunged: false,
}
let pinia: ReturnType<typeof createPinia>
let app: VueApp
let router: Router
let host: HTMLElement

async function settle() {
  await vi.dynamicImportSettled()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await nextTick()
}
async function visit(path: string) {
  await router.push(path)
  await settle()
}
async function enterKeyword(value: string) {
  const input = host.querySelector("input")!
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
}
/* 分类面板挂在 body 下的 Portal 里，要从 document 找 */
const category = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("button")].find((node) => node.textContent?.trim() === text)!
async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLElement>("button, a")].find(
    (element) => element.textContent?.trim() === text,
  )
  expect(button, `${text}: ${router.currentRoute.value.fullPath}\n${host.textContent}`).toBeDefined()
  button!.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true, cancelable: true }))
  await settle()
}

beforeEach(async () => {
  vi.resetAllMocks()
  localStorage.clear()
  document.cookie = "sidebar_state=true; path=/"
  window.history.replaceState({}, "", "/")
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true })
  vi.spyOn(window, "scrollTo").mockImplementation((options: ScrollToOptions | number = 0) => {
    if (typeof options === "object") {
      Object.defineProperty(window, "scrollY", { value: options.top ?? 0, writable: true, configurable: true })
    }
  })
  vi.mocked(searchGalleries).mockResolvedValue({ items: [gallery], nextCursor: null })
  vi.mocked(fetchGalleryDetail).mockImplementation(async (gid, token) => ({
    gallery: { ...gallery, gid, token, title: `测试图集${gid}` },
    progress: 3,
    imageUrlTemplate: "/image/{page}",
  }))
  vi.mocked(fetchGalleryComments).mockResolvedValue([])
  vi.mocked(saveProgress).mockResolvedValue(null)
  vi.mocked(fetchReadingHistory).mockResolvedValue({
    items: [{ gid: gallery.gid, token: gallery.token, page: 3, readAt: gallery.postedAt, gallery }],
    nextCursor: null,
  })
  vi.mocked(removeReadingHistory).mockResolvedValue(null)
  vi.mocked(clearReadingHistory).mockResolvedValue(null)
  vi.mocked(fetchCredentialStatus).mockResolvedValue({ bound: false, memberId: "", hasExAccess: false })
  vi.mocked(fetchHolidayDetail).mockImplementation(async (date) => ({ date, name: "", isOffDay: false }))
  let preferences = { categories: [] as string[], readerInterval: 5 }
  let history: string[] = []
  vi.mocked(fetchGalleryPreferences).mockImplementation(async () => structuredClone(preferences))
  vi.mocked(saveGalleryCategories).mockImplementation(async (categories) => {
    preferences = { ...preferences, categories: [...categories] }
    return null
  })
  vi.mocked(saveReaderInterval).mockResolvedValue(null)
  vi.mocked(fetchSearchHistory).mockImplementation(async () => [...history])
  vi.mocked(recordSearch).mockImplementation(async (keyword) => {
    history = [keyword, ...history.filter((entry) => entry !== keyword)]
    return [...history]
  })
  vi.mocked(removeSearch).mockImplementation(async (keyword) => {
    history = history.filter((entry) => entry !== keyword)
    return [...history]
  })
  vi.mocked(clearSearchHistory).mockImplementation(async () => {
    history = []
    return [...history]
  })
  pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.user = { id: 1, username: "tester" }
  auth.ready = true
  router = createRouter({
    history: createWebHistory(),
    routes: AppRouter.options.routes,
    scrollBehavior: AppRouter.options.scrollBehavior,
  })
  host = document.createElement("div")
  document.body.append(host)
  app = createApp(App).use(pinia).use(router)
  await router.push("/eh")
  await router.isReady()
  app.mount(host)
  await settle()
})

afterEach(() => {
  app.unmount()
  disposePinia(pinia)
  router.options.history.destroy()
  host.remove()
  vi.restoreAllMocks()
})

describe("阅读历史与二级导航", () => {
  it("历史、详情、阅读往返保留来源和滚动位置，搜索缓存不被挤掉", async () => {
    const searchInput = host.querySelector("input")
    await click("阅读历史")
    expect(router.currentRoute.value.name).toBe("gallery-history")
    window.scrollTo({ top: 600 })
    const row = host.querySelector<HTMLElement>('a[href="/eh/g/1/aaaaaaaaaa?source=history"]')!
    row.click()
    await settle()
    await click("继续阅读（第 3 页）")
    host.querySelector<HTMLElement>('[aria-label="下一页"]')!.click()
    await settle()
    expect(router.currentRoute.value.query.source).toBe("history")
    host.querySelector<HTMLElement>('[aria-label="退出阅读"]')!.click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe("/eh/g/1/aaaaaaaaaa?source=history")
    await click("返回列表")
    expect(router.currentRoute.value.name).toBe("gallery-history")
    expect(window.scrollY).toBe(600)
    expect(fetchReadingHistory).toHaveBeenCalledTimes(2)
    await click("继续阅读")
    host.querySelector<HTMLElement>('[aria-label="下一页"]')!.click()
    await settle()
    expect(router.currentRoute.value.query.returnTo).toBe("history")
    host.querySelector<HTMLElement>('[aria-label="退出阅读"]')!.click()
    await settle()
    expect(router.currentRoute.value.name).toBe("gallery-history")
    await click("图集搜索")
    expect(host.querySelector("input")).toBe(searchInput)
    expect(searchGalleries).toHaveBeenCalledTimes(1)
  })

  it("保存仍在进行时退出不等待，历史查询在 Store 中排队", async () => {
    await visit("/eh/history")
    let finish!: (value: null) => void
    vi.mocked(saveProgress).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    await click("继续阅读")
    await vi.waitFor(() => expect(saveProgress).toHaveBeenCalledWith(1, "aaaaaaaaaa", 3, expect.any(AbortSignal)), {
      timeout: 2000,
    })
    await visit("/eh/history")
    expect(router.currentRoute.value.name).toBe("gallery-history")
    expect(fetchReadingHistory).toHaveBeenCalledTimes(1)
    finish(null)
    await settle()
    expect(fetchReadingHistory).toHaveBeenCalledTimes(2)
  })

  it("删除失败保留条目，成功后清除缓存详情的继续阅读页码，清空必须确认", async () => {
    await visit("/eh/g/1/aaaaaaaaaa")
    await visit("/eh/history")
    vi.mocked(removeReadingHistory).mockRejectedValueOnce(new Error("删除失败测试"))
    host.querySelector<HTMLElement>('[aria-label="删除阅读记录：1"]')!.click()
    await settle()
    expect(host.textContent).toContain("删除失败测试")
    expect(host.textContent).toContain("测试图集")
    vi.mocked(fetchReadingHistory).mockResolvedValueOnce({ items: [], nextCursor: null })
    host.querySelector<HTMLElement>('[aria-label="删除阅读记录：1"]')!.click()
    await settle()
    expect(host.textContent).toContain("还没有阅读记录")
    await visit("/eh/g/1/aaaaaaaaaa")
    expect(host.textContent).toContain("开始阅读")
    expect(host.textContent).not.toContain("继续阅读（第 3 页）")
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(1)
    await visit("/eh/history")
    await click("清空全部")
    expect(clearReadingHistory).not.toHaveBeenCalled()
    const confirmation = [...document.querySelectorAll<HTMLElement>('[role="alertdialog"] button')].find(
      (node) => node.textContent?.trim() === "清空",
    )!
    confirmation.click()
    await settle()
    expect(clearReadingHistory).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain("还没有阅读记录")
  })

  it("详情和历史按序查询，删除后缓存详情直接读取 Store 的新进度", async () => {
    let finish!: (value: Awaited<ReturnType<typeof fetchGalleryDetail>>) => void
    vi.mocked(fetchGalleryDetail).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    await visit("/eh/g/1/aaaaaaaaaa")
    await visit("/eh/history")
    expect(fetchReadingHistory).not.toHaveBeenCalled()
    finish({ gallery, progress: 17, imageUrlTemplate: "/image/{page}" })
    await settle()
    vi.mocked(fetchReadingHistory).mockResolvedValueOnce({ items: [], nextCursor: null })
    host.querySelector<HTMLElement>('[aria-label="删除阅读记录：1"]')!.click()
    await settle()
    await visit("/eh/g/1/aaaaaaaaaa")
    expect(host.textContent).toContain("开始阅读")
    expect(host.textContent).not.toContain("继续阅读（第 17 页）")
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(1)
  })

  it("游标翻页失败可重试，失效记录仍显示进度并可删除", async () => {
    vi.mocked(fetchReadingHistory).mockResolvedValueOnce({
      items: [{ gid: 1, token: gallery.token, page: 7, readAt: gallery.postedAt, gallery: null }],
      nextCursor: "next",
    })
    await visit("/eh/history")
    expect(host.textContent).toContain("失效记录 · 图集 1")
    expect(host.textContent).toContain("第 7 页")
    expect(host.querySelector('a[href*="/eh/read/"]')).toBeNull()
    vi.mocked(fetchReadingHistory).mockRejectedValueOnce(new Error("历史加载失败测试"))
    await click("下一页")
    expect(host.textContent).toContain("历史加载失败测试")
    vi.mocked(fetchReadingHistory).mockResolvedValueOnce({ items: [], nextCursor: null })
    await click("重试")
    expect(fetchReadingHistory).toHaveBeenLastCalledWith("next", expect.any(AbortSignal))
    expect(host.textContent).toContain("这一页已没有记录")
    await click("上一页")
    expect(fetchReadingHistory).toHaveBeenLastCalledWith("", expect.any(AbortSignal))
    expect(host.textContent).toContain("测试图集")
  })

  it("离开历史取消请求，迟到响应不覆盖重新进入的结果", async () => {
    let finish!: (value: Awaited<ReturnType<typeof fetchReadingHistory>>) => void
    vi.mocked(fetchReadingHistory).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    await visit("/eh/history")
    const signal = vi.mocked(fetchReadingHistory).mock.calls[0]![1]!
    await visit("/eh")
    expect(signal.aborted).toBe(true)
    await visit("/eh/history")
    finish({ items: [], nextCursor: null })
    await settle()
    expect(host.textContent).toContain("测试图集")
    expect(host.textContent).not.toContain("还没有阅读记录")
  })

  it("图库父项只折叠菜单，详情只激活分组，图标模式也能进入历史", async () => {
    const parent = host.querySelector<HTMLElement>('[aria-controls="navigation-gallery"]')!
    expect(parent.getAttribute("aria-expanded")).toBe("true")
    parent.click()
    await settle()
    expect(parent.getAttribute("aria-expanded")).toBe("false")
    expect(router.currentRoute.value.name).toBe("gallery-list")
    await visit("/eh/g/1/aaaaaaaaaa")
    expect(parent.getAttribute("aria-expanded")).toBe("true")
    expect(parent.getAttribute("data-active")).toBe("true")
    expect(host.querySelector('[data-slot="sidebar-menu-sub-button"][data-active="true"]')).toBeNull()
    host.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')!.click()
    await settle()
    host.querySelector<HTMLElement>('button[aria-label="图库"]')!.click()
    await settle()
    const link = document.querySelector<HTMLElement>('nav[aria-label="图库"] a[href="/eh/history"]')!
    expect(link).not.toBeNull()
    link.click()
    await settle()
    expect(router.currentRoute.value.name).toBe("gallery-history")
    expect(document.querySelector('nav[aria-label="图库"]')).toBeNull()
  })
})

describe("页面缓存与失效范围", () => {
  it("侧栏页面往返保留首页、节假日日期和设置草稿", async () => {
    await visit("/")
    const home = host.querySelector(".page-content")!
    await visit("/holiday")
    const holiday = host.querySelector(".page-content")!
    const day = host.querySelector<HTMLButtonElement>(
      '[data-slot="calendar-cell-trigger"]:not([data-selected]):not([data-outside-view])',
    )!
    day.click()
    await settle()
    expect(day.hasAttribute("data-selected")).toBe(true)
    const holidayRequests = vi.mocked(fetchHolidayDetail).mock.calls.length
    await visit("/settings")
    const form = host.querySelector("form")!
    const input = host.querySelector<HTMLInputElement>("#ipbMemberId")!
    input.value = "未提交的草稿"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()

    await visit("/")
    expect(host.querySelector(".page-content")).toBe(home)
    await visit("/holiday")
    expect(host.querySelector(".page-content")).toBe(holiday)
    expect(day.hasAttribute("data-selected")).toBe(true)
    expect(fetchHolidayDetail).toHaveBeenCalledTimes(holidayRequests)
    await visit("/settings")
    expect(host.querySelector("form")).toBe(form)
    expect(host.querySelector<HTMLInputElement>("#ipbMemberId")!.value).toBe("未提交的草稿")
    expect(fetchCredentialStatus).toHaveBeenCalledTimes(1)
  })

  it.each(["登录", "退出"])("%s清空全部页面缓存，包括停用布局中的页面", async (action) => {
    const pages = new Map<string, Element>()
    for (const path of ["/", "/holiday", "/settings", "/eh", "/eh/g/1/aaaaaaaaaa"]) {
      /* eslint-disable-next-line no-await-in-loop -- 必须逐页进入，才能建立同一个路由器的页面缓存。 */
      await visit(path)
      pages.set(path, host.querySelector(".page-content")!)
      if (path === "/settings") {
        const input = host.querySelector<HTMLInputElement>("#ipbPassHash")!
        input.value = "旧账号的凭据草稿"
        input.dispatchEvent(new Event("input", { bubbles: true }))
      }
    }
    await visit("/login")
    const auth = useAuthStore()
    if (action === "登录") {
      vi.mocked(authenticate).mockResolvedValue({ token: "new-token", user: { id: 2, username: "second" } })
      await auth.authenticate("login", "second", "password")
    } else {
      auth.logout()
      /* 只恢复测试身份，不调用登录清缓存，单独验证退出的失效效果。 */
      auth.user = { id: 2, username: "second" }
    }
    await settle()
    for (const [path, page] of pages) {
      /* eslint-disable-next-line no-await-in-loop -- 路由切换必须串行，逐页检查缓存是否已经重建。 */
      await visit(path)
      expect(host.querySelector(".page-content")).not.toBe(page)
    }
    await visit("/settings")
    expect(host.querySelector<HTMLInputElement>("#ipbPassHash")!.value).toBe("")
    expect(fetchHolidayDetail).toHaveBeenCalledTimes(2)
    expect(fetchCredentialStatus).toHaveBeenCalledTimes(2)
    expect(searchGalleries).toHaveBeenCalledTimes(2)
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(2)
  })

  it("历史标签使用独立的搜索与删除按钮，删除不会触发搜索", async () => {
    await enterKeyword("cat")
    await click("搜索")
    const history = host.querySelector('[aria-label="搜索历史"]')!
    expect(history.querySelector('[data-slot="badge"]')?.tagName).toBe("SPAN")
    expect(history.querySelector("button button")).toBeNull()
    const count = vi.mocked(searchGalleries).mock.calls.length
    history.querySelector<HTMLElement>('[aria-label="删除历史：cat"]')!.click()
    await settle()
    expect(searchGalleries).toHaveBeenCalledTimes(count)
    expect(history.querySelector('[data-slot="badge"]')).toBeNull()
    expect(removeSearch).toHaveBeenCalledExactlyOnceWith("cat", expect.any(AbortSignal))
  })

  it("阅读返回保留详情 DOM、评论和滚动位置，仅同步进度；列表返回保留输入与条目", async () => {
    const list = host.querySelector('a[href="/eh/g/1/aaaaaaaaaa"]')!
    const input = host.querySelector("input")!
    input.value = "尚未提交"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    window.scrollTo({ top: 800 })
    await nextTick()
    list.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true, cancelable: true }))
    await settle()
    const heading = host.querySelector("h2")!
    window.scrollTo({ top: 450 })
    await click("继续阅读（第 3 页）")
    // 阅读器翻页不增加历史记录。
    await router.replace("/eh/read/1/aaaaaaaaaa/17")
    await router.replace("/eh/read/1/aaaaaaaaaa/18")
    await vi.waitFor(() => expect(saveProgress).toHaveBeenCalledWith(1, "aaaaaaaaaa", 18, expect.any(AbortSignal)), {
      timeout: 2000,
    })
    await settle()
    host.querySelector<HTMLElement>('[aria-label="退出阅读"]')!.click()
    await settle()
    expect(host.querySelector("h2")).toBe(heading)
    expect(host.textContent).toContain("继续阅读（第 18 页）")
    expect(window.scrollY).toBe(450)
    expect(fetchGalleryComments).toHaveBeenCalledTimes(1)
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(2)
    expect(saveProgress).toHaveBeenLastCalledWith(1, "aaaaaaaaaa", 18, expect.any(AbortSignal))
    await click("返回列表")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(host.querySelector("input")).toBe(input)
    expect(input.value).toBe("尚未提交")
    expect(window.scrollY).toBe(800)
    expect(searchGalleries).toHaveBeenCalledTimes(1)
  })

  it("阅读控件双向绑定页码，间隔按钮保存偏好，图片失败后可重试", async () => {
    await visit("/eh/read/1/aaaaaaaaaa/1")
    const viewport = host.querySelector('[aria-label="横向阅读区域"]')!
    await vi.waitFor(() => expect(viewport.querySelector("img")).not.toBeNull())
    const image = viewport.querySelector("img")!
    const imageUrl = image.getAttribute("src")
    image.dispatchEvent(new Event("error"))
    await nextTick()
    expect(viewport.textContent).toContain("第 1 页加载失败")
    await click("重试")
    expect(viewport.querySelector("img")?.getAttribute("src")).not.toBe(imageUrl)

    const range = host.querySelector<HTMLInputElement>('[aria-label="阅读进度"]')!
    range.value = "17"
    range.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    expect(router.currentRoute.value.params.page).toBe("17")
    expect(range.getAttribute("aria-valuetext")).toBe("第 17 页，共 100 页")
    host.querySelector<HTMLButtonElement>('[aria-label="增加自动翻页间隔"]')!.click()
    await nextTick()
    expect(host.querySelector('[aria-label="自动翻页间隔"]')!.textContent.trim()).toBe("6 秒")
    expect(saveReaderInterval).not.toHaveBeenCalled()
    host.querySelector<HTMLElement>('[aria-label="开始自动翻页"]')!.click()
    await nextTick()
    const pause = host.querySelector<HTMLElement>('[aria-label="暂停自动翻页"]')!
    expect(pause.getAttribute("aria-pressed")).toBe("true")
    pause.click()
    await visit("/eh/read/1/aaaaaaaaaa/100")
    expect(range.value).toBe("100")
    expect(host.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.disabled).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[aria-label="开始自动翻页"]')!.disabled).toBe(true)
  })

  it("换图集复用一份详情但重置内容和位置，凭据变更淘汰缓存", async () => {
    await visit("/eh/g/1/aaaaaaaaaa")
    window.scrollTo({ top: 500 })
    await visit("/eh")
    await visit("/eh/g/2/bbbbbbbbbb")
    expect(host.textContent).toContain("测试图集2")
    expect(window.scrollY).toBe(0)
    expect(fetchGalleryComments).toHaveBeenCalledTimes(2)
    useEhStore().invalidateCache()
    await settle()
    expect(fetchGalleryComments).toHaveBeenCalledTimes(3)
    await click("返回列表")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(searchGalleries).toHaveBeenCalledTimes(2)
  })

  it.each(["绑定", "解绑"])("%s只淘汰图库缓存，保留设置页且不重新读取凭据状态", async (action) => {
    vi.mocked(fetchCredentialStatus).mockResolvedValue({ bound: true, memberId: "123", hasExAccess: false })
    vi.mocked(bindCredential).mockResolvedValue({ bound: true, memberId: "456", hasExAccess: true })
    vi.mocked(unbindCredential).mockResolvedValue({ bound: false, memberId: "", hasExAccess: false })
    await visit("/eh/g/1/aaaaaaaaaa")
    await visit("/")
    const home = host.querySelector(".page-content")!
    await visit("/holiday")
    const holiday = host.querySelector(".page-content")!
    await visit("/settings")
    const form = host.querySelector("form")!
    expect(form).not.toBeNull()
    if (action === "绑定") {
      const input = host.querySelector<HTMLInputElement>("#ipbMemberId")!
      input.value = "456"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await nextTick()
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await settle()
    } else {
      await click("解绑")
    }
    const expectedBindCalls = action === "绑定" ? [[{ ipbMemberId: "456", ipbPassHash: "", igneous: "" }]] : []
    expect(vi.mocked(bindCredential).mock.calls).toEqual(expectedBindCalls)
    expect(unbindCredential).toHaveBeenCalledTimes(action === "解绑" ? 1 : 0)
    expect(host.textContent).toContain(action === "绑定" ? "绑定成功，里站已解锁。" : "未绑定")
    expect(host.querySelector<HTMLInputElement>("#ipbMemberId")!.value).toBe("")
    expect(host.querySelector("form")).toBe(form)
    await visit("/")
    expect(host.querySelector(".page-content")).toBe(home)
    await visit("/holiday")
    expect(host.querySelector(".page-content")).toBe(holiday)
    expect(fetchHolidayDetail).toHaveBeenCalledTimes(1)
    await visit("/settings")
    expect(host.querySelector("form")).toBe(form)
    expect(fetchCredentialStatus).toHaveBeenCalledTimes(1)
    await visit("/eh")
    expect(searchGalleries).toHaveBeenCalledTimes(2)
    await visit("/eh/g/1/aaaaaaaaaa")
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(2)
    expect(fetchGalleryComments).toHaveBeenCalledTimes(2)
  })

  it("绑定失败保留输入和图库缓存，并恢复提交按钮", async () => {
    vi.mocked(fetchCredentialStatus).mockResolvedValue({ bound: false, memberId: "", hasExAccess: false })
    vi.mocked(bindCredential).mockRejectedValueOnce(new Error("凭据无效"))
    const listInput = host.querySelector("input")
    await visit("/settings")
    const form = host.querySelector("form")!
    const input = host.querySelector<HTMLInputElement>("#ipbMemberId")!
    input.value = "456"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
    expect(host.textContent).toContain("凭据无效")
    expect(input.value).toBe("456")
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
    await visit("/eh")
    expect(host.querySelector("input")).toBe(listInput)
    expect(searchGalleries).toHaveBeenCalledTimes(1)
  })

  it("分类草稿关闭不生效，应用才搜索；历史词沿用当前分类", async () => {
    await enterKeyword("cat")
    await click("分类")
    category("漫画").click()
    await settle()
    expect(searchGalleries).toHaveBeenCalledTimes(1)
    category("漫画").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await settle()
    expect(router.currentRoute.value.query.categories).toBeUndefined()
    await click("分类")
    expect(category("漫画").getAttribute("aria-pressed")).toBe("false")
    category("漫画").click()
    await settle()
    category("应用").click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "cat", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    expect(saveGalleryCategories).toHaveBeenCalledExactlyOnceWith(["manga"], expect.any(AbortSignal))
    expect(host.textContent).toContain("分类 (1)")
    expect(recordSearch).toHaveBeenCalledExactlyOnceWith("cat", expect.any(AbortSignal))
    await enterKeyword("dog")
    await click("搜索")
    await click("cat")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "cat", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
  })

  it("返回列表时读取其他设备的新分类与历史，不提交当前输入草稿", async () => {
    await enterKeyword("cat")
    await click("搜索")
    await enterKeyword("尚未提交")
    await visit("/eh/g/1/aaaaaaaaaa")
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], readerInterval: 5 })
    vi.mocked(fetchSearchHistory).mockResolvedValue(["其他设备的搜索"])
    await click("返回列表")
    expect(host.querySelector("input")?.value).toBe("尚未提交")
    expect(host.textContent).toContain("其他设备的搜索")
    expect(host.textContent).toContain("分类 (1)")
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "cat", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    expect(recordSearch).toHaveBeenCalledExactlyOnceWith("cat", expect.any(AbortSignal))
    expect(saveGalleryCategories).not.toHaveBeenCalled()
  })

  it("分类和历史保存失败不阻断本次搜索，并显示未保存提示", async () => {
    vi.mocked(saveGalleryCategories).mockRejectedValue(new Error("断网"))
    vi.mocked(recordSearch).mockRejectedValue(new Error("断网"))
    await enterKeyword("cat")
    await click("分类")
    category("漫画").click()
    await settle()
    category("应用").click()
    await settle()
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "cat", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    expect(host.textContent).toContain("分类保存失败")
    expect(host.textContent).toContain("搜索历史保存失败")
    expect(host.querySelector("fieldset")!.disabled).toBe(false)
  })

  it("同一详情从新搜索进入后，浏览器后退仍保留详情与最新搜索", async () => {
    await enterKeyword("cat")
    await click("搜索")
    await router.push({ name: "gallery-detail", params: { gid: 1, token: gallery.token } })
    await settle()
    await click("返回列表")
    await enterKeyword("dog")
    await click("搜索")
    await router.push({ name: "gallery-detail", params: { gid: 1, token: gallery.token } })
    await settle()
    const heading = host.querySelector("h2")
    await click("继续阅读（第 3 页）")
    await router.replace("/eh/read/1/aaaaaaaaaa/29")
    await settle()
    router.back()
    await settle()
    expect(host.querySelector("h2")).toBe(heading)
    /* 尚未到防抖时间，先显示上次确认的页码；退出不会立即补报。 */
    expect(host.textContent).toContain("继续阅读（第 3 页）")
    expect(saveProgress).not.toHaveBeenCalled()
    await click("返回列表")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(host.querySelector("input")?.value).toBe("dog")
    expect(fetchGalleryComments).toHaveBeenCalledTimes(1)
  })

  it("其他布局页往返仍保留列表；退出账号销毁旧页面", async () => {
    const input = host.querySelector("input")
    await visit("/")
    await visit("/eh")
    expect(host.querySelector("input")).toBe(input)
    expect(searchGalleries).toHaveBeenCalledTimes(1)
    const auth = useAuthStore()
    auth.logout()
    await router.replace("/login")
    await settle()
    auth.user = { id: 2, username: "second" }
    await visit("/eh")
    expect(host.querySelector("input")).not.toBe(input)
    expect(searchGalleries).toHaveBeenCalledTimes(2)
  })

  it("搜索不产生路由历史，提交新条件回到顶部", async () => {
    const position = router.options.history.state.position
    window.scrollTo({ top: 800 })
    await enterKeyword("new")
    await click("搜索")
    expect(window.scrollY).toBe(0)
    expect(host.querySelector("input")?.value).toBe("new")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(router.options.history.state.position).toBe(position)
  })

  it("重建组件时恢复分类但清空当前关键词，历史仍可再次使用", async () => {
    await enterKeyword("cat")
    await click("分类")
    category("漫画").click()
    await settle()
    category("应用").click()
    await settle()
    // 模拟刷新后的全新页面实例，而非 KeepAlive 激活。
    useEhStore().invalidateCache()
    await settle()
    expect(host.querySelector("input")?.value).toBe("")
    expect(host.textContent).toContain("分类 (1)")
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
    await click("cat")
    expect(host.querySelector("input")?.value).toBe("cat")
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "cat", categories: ["manga"], cursor: "" },
      expect.any(AbortSignal),
    )
  })
})
