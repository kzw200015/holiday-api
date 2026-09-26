// @vitest-environment happy-dom
import { recordSearchKeyword } from "@myapi/shared/eh"
import { useQueryCache } from "@pinia/colada"
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp, nextTick, type App as VueApp } from "vue"
import { createRouter, createWebHistory, type Router } from "vue-router"

import App from "@/app/App.vue"
import { AppRouter } from "@/app/router"
import { authenticate } from "@/features/auth/api"
import { useAuthStore } from "@/features/auth/store"
import type * as EhApi from "@/features/eh/api"
import {
  addSearchKeyword,
  bindCredential,
  clearReadingHistory,
  clearSearchHistory,
  fetchCredentialStatus,
  fetchGalleryComments,
  fetchGalleryDetail,
  fetchGalleryPreferences,
  fetchGalleryPreviews,
  fetchPageImageUrl,
  fetchReadingHistory,
  fetchReadingProgress,
  fetchSearchHistory,
  fetchTagTranslationStatus,
  patchGalleryPreferences,
  removeReadingHistory,
  removeSearchKeyword,
  saveProgress,
  searchGalleries,
  unbindCredential,
} from "@/features/eh/api"
import { invalidateEhContent } from "@/features/eh/queries"
import type * as HolidayApi from "@/features/holiday/api"
import { fetchHolidayDetail } from "@/features/holiday/api"
import { installQueries } from "@/shared/api/queries"
import type { GalleryDetail } from "@server/eh/gallery-catalog"
import type { GalleryPreferences } from "@server/eh/preferences.service"
import { byText, deferred, present, query } from "./support"

vi.mock("@/features/auth/api", () => ({ authenticate: vi.fn(), fetchAuthOptions: vi.fn(), fetchCurrentUser: vi.fn() }))
vi.mock("@/features/holiday/api", async (original) => ({
  ...(await original<typeof HolidayApi>()),
  fetchHolidayDetail: vi.fn(),
}))
vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  bindCredential: vi.fn(),
  fetchReadingHistory: vi.fn(),
  removeReadingHistory: vi.fn(),
  clearReadingHistory: vi.fn(),
  fetchCredentialStatus: vi.fn(),
  unbindCredential: vi.fn(),
  fetchGalleryComments: vi.fn(),
  fetchGalleryPreviews: vi.fn(),
  fetchGalleryDetail: vi.fn(),
  fetchPageImageUrl: vi.fn(),
  fetchReadingProgress: vi.fn(),
  fetchTagTranslationStatus: vi.fn(),
  saveProgress: vi.fn(),
  searchGalleries: vi.fn(),
  fetchGalleryPreferences: vi.fn(),
  fetchSearchHistory: vi.fn(),
  patchGalleryPreferences: vi.fn(),
  addSearchKeyword: vi.fn(),
  removeSearchKeyword: vi.fn(),
  clearSearchHistory: vi.fn(),
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
  const input = query(host, "input")
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
}
/* 筛选面板挂在 body 下的 Portal 里，要从 document 找 */
const category = (text: string) => byText(document, "button", text)
async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLElement>("button, a")].find(
    (element) => element.textContent?.trim() === text,
  )
  present(button, `「${text}」（${router.currentRoute.value.fullPath}\n${host.textContent}）`).dispatchEvent(
    new MouseEvent("click", { button: 0, bubbles: true, cancelable: true }),
  )
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
  /* 进度每次进入详情都重读，所以要像服务端一样记住：没读过的算读到第 3 页，保存、删除都会改它。 */
  const progresses = new Map<number, number | null>()
  vi.mocked(fetchGalleryDetail).mockImplementation(async (gid, token) => ({
    ...gallery,
    gid,
    token,
    title: `测试图集${gid}`,
  }))
  vi.mocked(fetchReadingProgress).mockImplementation(async (gid) => ({
    page: progresses.has(gid) ? (progresses.get(gid) ?? null) : 3,
  }))
  vi.mocked(fetchPageImageUrl).mockImplementation(async (gid, _token, page) => ({
    url: `/image/${gid}/${page}?signed`,
  }))
  vi.mocked(fetchGalleryComments).mockResolvedValue({ comments: [], hiddenCount: 0 })
  vi.mocked(fetchGalleryPreviews).mockResolvedValue([])
  vi.mocked(saveProgress).mockImplementation(async (gid, _token, page) => {
    progresses.set(gid, page)
    return null
  })
  /* 阅读历史同样照服务端的样子：删掉或清空之后读回来就没有这条了。 */
  vi.mocked(fetchReadingHistory).mockImplementation(async () => {
    const page = progresses.has(gallery.gid) ? progresses.get(gallery.gid) : 3
    return {
      items: page ? [{ gid: gallery.gid, token: gallery.token, page, readAt: gallery.postedAt, gallery }] : [],
      nextCursor: null,
    }
  })
  vi.mocked(removeReadingHistory).mockImplementation(async (gid) => {
    progresses.set(gid, null)
    return null
  })
  vi.mocked(clearReadingHistory).mockImplementation(async () => {
    for (const gid of [gallery.gid, 2]) {
      progresses.set(gid, null)
    }
    return null
  })
  vi.mocked(fetchCredentialStatus).mockResolvedValue({ bound: false, memberId: "", hasExAccess: false })
  vi.mocked(fetchTagTranslationStatus).mockResolvedValue({ lastSync: null })
  vi.mocked(fetchHolidayDetail).mockImplementation(async (date) => ({ date, name: "", isOffDay: false }))
  let preferences: GalleryPreferences = { categories: [], minRating: null, readerInterval: 5 }
  let history: string[] = []
  vi.mocked(fetchGalleryPreferences).mockImplementation(async () => structuredClone(preferences))
  /* 像服务端一样：偏好只改带来的字段，搜索历史一次记或删一个词。 */
  vi.mocked(patchGalleryPreferences).mockImplementation(async (patch) => {
    preferences = { ...preferences, ...structuredClone(patch) }
    return null
  })
  vi.mocked(fetchSearchHistory).mockImplementation(async () => [...history])
  vi.mocked(addSearchKeyword).mockImplementation(async (keyword) => {
    history = recordSearchKeyword(history, keyword)
    return null
  })
  vi.mocked(removeSearchKeyword).mockImplementation(async (keyword) => {
    history = history.filter((entry) => entry !== keyword)
    return null
  })
  vi.mocked(clearSearchHistory).mockImplementation(async () => {
    history = []
    return null
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
  app = createApp(App).use(pinia)
  installQueries(app)
  app.use(router)
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
    const row = query<HTMLElement>(host, 'a[href="/eh/g/1/aaaaaaaaaa?source=history"]')
    row.click()
    await settle()
    await click("继续阅读（第 3 页）")
    query<HTMLElement>(host, '[aria-label="下一页"]').click()
    await settle()
    expect(router.currentRoute.value.query.source).toBe("history")
    query<HTMLElement>(host, '[aria-label="退出阅读"]').click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe("/eh/g/1/aaaaaaaaaa?source=history")
    /* 刚翻的那一页还没写进地址栏就退出了，这次迟到的同步不能把人拽回阅读器。 */
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(router.currentRoute.value.fullPath).toBe("/eh/g/1/aaaaaaaaaa?source=history")
    await click("返回列表")
    expect(router.currentRoute.value.name).toBe("gallery-history")
    expect(window.scrollY).toBe(600)
    expect(fetchReadingHistory).toHaveBeenCalledTimes(2)
    await click("继续阅读")
    query<HTMLElement>(host, '[aria-label="下一页"]').click()
    await settle()
    expect(router.currentRoute.value.query.source).toBe("history")
    /* 从历史直接进阅读，退出同样落在详情页，再按一次返回才回到历史列表。 */
    query<HTMLElement>(host, '[aria-label="退出阅读"]').click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe("/eh/g/1/aaaaaaaaaa?source=history")
    await click("返回列表")
    expect(router.currentRoute.value.name).toBe("gallery-history")
    await click("图集搜索")
    expect(host.querySelector("input")).toBe(searchInput)
    expect(searchGalleries).toHaveBeenCalledTimes(1)
  })

  /* 退出阅读时补发的那页还在路上，这时读回来的历史还是旧页码，点「继续阅读」就会把进度按回去。 */
  it("回到历史时等已发出的进度落地再重取，显示的是刚读到的页", async () => {
    let saved = 3
    vi.mocked(fetchReadingHistory).mockImplementation(async () => ({
      items: [{ gid: gallery.gid, token: gallery.token, page: saved, readAt: gallery.postedAt, gallery }],
      nextCursor: null,
    }))
    const record = async (_gid: number, _token: string, page: number) => {
      saved = page
      return null
    }
    let finish: (() => void) | undefined
    vi.mocked(saveProgress)
      .mockImplementationOnce(record)
      .mockImplementationOnce(
        (gid, token, page) =>
          new Promise((resolve) => {
            finish = () => resolve(record(gid, token, page))
          }),
      )
      .mockImplementation(record)
    await visit("/eh/history")
    await click("继续阅读")
    await vi.waitFor(() => expect(saveProgress).toHaveBeenCalledWith(1, "aaaaaaaaaa", 3), {
      timeout: 2000,
    })
    await router.replace("/eh/read/1/aaaaaaaaaa/30?source=history")
    await settle()
    await visit("/eh/history")
    expect(router.currentRoute.value.name).toBe("gallery-history")
    /* 退出时补发的第 30 页还没回来；这时去读，读回来的还是第 3 页。 */
    expect(saveProgress).toHaveBeenLastCalledWith(1, "aaaaaaaaaa", 30)
    expect(fetchReadingHistory).toHaveBeenCalledTimes(1)
    present(finish, "第二次进度保存")()
    await settle()
    expect(fetchReadingHistory).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain("第 30 页")
  })

  /* 历史的上一条正好就是要回的地方就退回去：原地替换会留下两条一样的记录，按系统后退键时停在原地不动。 */
  it("返回列表和退出阅读退回上一条历史，不留重复的记录", async () => {
    /* 首次导航总是替换当前记录，先从首页走进图库，好让图库前面有一条确定的记录。 */
    await visit("/")
    await visit("/eh")
    query(host, 'a[href="/eh/g/1/aaaaaaaaaa"]').dispatchEvent(
      new MouseEvent("click", { button: 0, bubbles: true, cancelable: true }),
    )
    await settle()
    await click("继续阅读（第 3 页）")
    expect(router.currentRoute.value.name).toBe("reader")
    query<HTMLElement>(host, '[aria-label="退出阅读"]').click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe("/eh/g/1/aaaaaaaaaa")
    await click("返回列表")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    /* 进图库之前在首页：再后退一次就该离开图库，而不是回到刚离开的详情或阅读器。 */
    router.back()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe("/")
  })

  it("上一条不是要回的地方时原地替换", async () => {
    await visit("/eh/history")
    /* 从历史直接进阅读，退出落在详情页：上一条是历史，所以详情顶替阅读器那一条。 */
    await click("继续阅读")
    query<HTMLElement>(host, '[aria-label="退出阅读"]').click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe("/eh/g/1/aaaaaaaaaa?source=history")
    await click("返回列表")
    expect(router.currentRoute.value.name).toBe("gallery-history")
    router.back()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe("/eh")
  })

  /* 手上有旧的一份时，重读失败不该把整页换成错误：内容照常显示，只提示一下并给重试。 */
  it("详情重读失败时照常显示旧内容，只提示刷新失败", async () => {
    await visit("/eh/g/1/aaaaaaaaaa")
    await visit("/eh/g/2/bbbbbbbbbb")
    vi.mocked(fetchGalleryDetail).mockRejectedValueOnce(new Error("刷新失败测试"))
    await visit("/eh/g/1/aaaaaaaaaa")
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(3)
    expect(host.querySelector("h2")?.textContent).toBe("测试图集1")
    expect(host.textContent).toContain("刷新失败测试")
    await click("重试")
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(4)
    expect(host.textContent).not.toContain("刷新失败测试")
    expect(host.querySelector("h2")?.textContent).toBe("测试图集1")
  })

  it("删除失败保留条目，成功后清除缓存详情的继续阅读页码，清空必须确认", async () => {
    await visit("/eh/g/1/aaaaaaaaaa")
    await visit("/eh/history")
    vi.mocked(removeReadingHistory).mockRejectedValueOnce(new Error("删除失败测试"))
    query<HTMLElement>(host, '[aria-label="删除阅读记录：1"]').click()
    await settle()
    expect(host.textContent).toContain("删除失败测试")
    expect(host.textContent).toContain("测试图集")
    /* 删除成功直接改本地的那一份列表，不再重新拉一页回来。 */
    query<HTMLElement>(host, '[aria-label="删除阅读记录：1"]').click()
    await settle()
    expect(host.textContent).toContain("还没有阅读记录")
    expect(fetchReadingHistory).toHaveBeenCalledTimes(1)
    await visit("/eh/g/1/aaaaaaaaaa")
    expect(host.textContent).toContain("开始阅读")
    expect(host.textContent).not.toContain("继续阅读（第 3 页）")
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(2)
    /* 在别处又读了一本：回到历史时重读，有东西可清空了。 */
    vi.mocked(fetchReadingHistory).mockResolvedValueOnce({
      items: [{ gid: 2, token: "bbbbbbbbbb", page: 5, readAt: gallery.postedAt, gallery: null }],
      nextCursor: null,
    })
    await visit("/eh/history")
    await click("清空全部")
    expect(clearReadingHistory).not.toHaveBeenCalled()
    const confirmation = byText(document, '[role="alertdialog"] button', "清空")
    confirmation.click()
    await settle()
    expect(clearReadingHistory).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain("还没有阅读记录")
  })

  it("详情在途不挡历史查询；删除之后缓存里的详情不再显示继续阅读", async () => {
    const detail = deferred<Awaited<ReturnType<typeof fetchGalleryDetail>>>()
    vi.mocked(fetchGalleryDetail).mockReturnValueOnce(detail.promise)
    await visit("/eh/g/1/aaaaaaaaaa")
    await visit("/eh/history")
    expect(fetchReadingHistory).toHaveBeenCalledTimes(1)
    detail.resolve(gallery)
    await settle()
    vi.mocked(fetchReadingHistory).mockResolvedValueOnce({ items: [], nextCursor: null })
    query<HTMLElement>(host, '[aria-label="删除阅读记录：1"]').click()
    await settle()
    await visit("/eh/g/1/aaaaaaaaaa")
    /* 回来照样重读；本地的进度已经作废，重读回来的服务端进度也没了，不会再冒出一个「继续阅读」。 */
    expect(host.textContent).toContain("开始阅读")
    expect(host.textContent).not.toContain("继续阅读")
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(2)
  })

  it("加载失败可重试，失效记录仍显示进度并可删除", async () => {
    vi.mocked(fetchReadingHistory).mockRejectedValueOnce(new Error("历史加载失败测试"))
    await visit("/eh/history")
    expect(host.textContent).toContain("历史加载失败测试")
    vi.mocked(fetchReadingHistory).mockResolvedValueOnce({
      items: [{ gid: 1, token: gallery.token, page: 7, readAt: gallery.postedAt, gallery: null }],
      nextCursor: null,
    })
    await click("重试")
    expect(host.textContent).not.toContain("历史加载失败测试")
    expect(host.textContent).toContain("失效记录 · 图集 1")
    expect(host.textContent).toContain("第 7 页")
    expect(host.querySelector('a[href*="/eh/read/"]')).toBeNull()
    query<HTMLElement>(host, '[aria-label="删除阅读记录：1"]').click()
    await settle()
    expect(removeReadingHistory).toHaveBeenCalledExactlyOnceWith(1)
    expect(host.textContent).toContain("还没有阅读记录")
  })

  /* 历史页被 KeepAlive 留着：回来时请求还在途就不发第二次，它的结果照样落到列表上。 */
  it("离开历史再回来，在途请求的结果仍然落到列表上", async () => {
    const history = deferred<Awaited<ReturnType<typeof fetchReadingHistory>>>()
    vi.mocked(fetchReadingHistory).mockReturnValueOnce(history.promise)
    await visit("/eh/history")
    await visit("/eh")
    await visit("/eh/history")
    history.resolve({
      items: [{ gid: 1, token: gallery.token, page: 3, readAt: gallery.postedAt, gallery }],
      nextCursor: null,
    })
    await settle()
    expect(host.textContent).toContain("测试图集")
    expect(host.textContent).not.toContain("还没有阅读记录")
  })

  it("图库父项只折叠菜单，详情只激活分组，图标模式也能进入历史", async () => {
    const parent = query<HTMLElement>(host, '[aria-controls="navigation-gallery"]')
    expect(parent.getAttribute("aria-expanded")).toBe("true")
    parent.click()
    await settle()
    expect(parent.getAttribute("aria-expanded")).toBe("false")
    expect(router.currentRoute.value.name).toBe("gallery-list")
    await visit("/eh/g/1/aaaaaaaaaa")
    expect(parent.getAttribute("aria-expanded")).toBe("true")
    expect(parent.getAttribute("data-active")).toBe("true")
    expect(host.querySelector('[data-slot="sidebar-menu-sub-button"][data-active="true"]')).toBeNull()
    query<HTMLElement>(host, '[data-slot="sidebar-trigger"]').click()
    await settle()
    query<HTMLElement>(host, 'button[aria-label="图库"]').click()
    await settle()
    const link = query<HTMLElement>(document, 'nav[aria-label="图库"] a[href="/eh/history"]')
    link.click()
    await settle()
    expect(router.currentRoute.value.name).toBe("gallery-history")
    expect(document.querySelector('nav[aria-label="图库"]')).toBeNull()
  })
})

describe("页面缓存与失效范围", () => {
  it("侧栏页面往返保留首页、节假日日期和设置草稿", async () => {
    await visit("/")
    const home = query(host, ".page-content")
    await visit("/holiday")
    const holiday = query(host, ".page-content")
    const day = query<HTMLButtonElement>(
      host,
      '[data-slot="calendar-cell-trigger"]:not([data-selected]):not([data-outside-view])',
    )
    day.click()
    await settle()
    expect(day.hasAttribute("data-selected")).toBe(true)
    const holidayRequests = vi.mocked(fetchHolidayDetail).mock.calls.length
    await visit("/settings")
    const form = query(host, "form")
    const input = query<HTMLInputElement>(host, "#ipbMemberId")
    input.value = "未提交的草稿"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()

    await visit("/")
    expect(host.querySelector(".page-content")).toBe(home)
    await visit("/holiday")
    expect(host.querySelector(".page-content")).toBe(holiday)
    expect(day.hasAttribute("data-selected")).toBe(true)
    expect(fetchHolidayDetail).toHaveBeenCalledTimes(holidayRequests)
    const credentialRequests = vi.mocked(fetchCredentialStatus).mock.calls.length
    await visit("/settings")
    expect(host.querySelector("form")).toBe(form)
    expect(query<HTMLInputElement>(host, "#ipbMemberId").value).toBe("未提交的草稿")
    /* 设置页回来会重读状态，但不重建：没提交的草稿还在 */
    expect(fetchCredentialStatus).toHaveBeenCalledTimes(credentialRequests + 1)
  })

  it.each(["登录", "退出"])("%s清空全部页面缓存，包括停用布局中的页面", async (action) => {
    const pages = new Map<string, Element>()
    for (const path of ["/", "/holiday", "/settings", "/eh", "/eh/g/1/aaaaaaaaaa"]) {
      /* eslint-disable-next-line no-await-in-loop -- 必须逐页进入，才能建立同一个路由器的页面缓存。 */
      await visit(path)
      pages.set(path, query(host, ".page-content"))
      if (path === "/settings") {
        const input = query<HTMLInputElement>(host, "#ipbPassHash")
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
    expect(query<HTMLInputElement>(host, "#ipbPassHash").value).toBe("")
    expect(fetchHolidayDetail).toHaveBeenCalledTimes(2)
    /* 每进一次图库或设置页都重读一次状态：换账号前后各进了一次图库、一次设置页，最后回到设置页又读一次。 */
    expect(fetchCredentialStatus).toHaveBeenCalledTimes(5)
    expect(searchGalleries).toHaveBeenCalledTimes(2)
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(2)
  })

  it("阅读返回保留详情 DOM、评论和滚动位置，仅同步进度；列表返回保留输入与条目", async () => {
    const list = query(host, 'a[href="/eh/g/1/aaaaaaaaaa"]')
    const input = query(host, "input")
    input.value = "尚未提交"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    window.scrollTo({ top: 800 })
    await nextTick()
    list.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true, cancelable: true }))
    await settle()
    const heading = query(host, "h2")
    window.scrollTo({ top: 450 })
    await click("继续阅读（第 3 页）")
    // 阅读器翻页不增加历史记录。
    await router.replace("/eh/read/1/aaaaaaaaaa/17")
    await router.replace("/eh/read/1/aaaaaaaaaa/18")
    await vi.waitFor(() => expect(saveProgress).toHaveBeenCalledWith(1, "aaaaaaaaaa", 18), {
      timeout: 2000,
    })
    await settle()
    query<HTMLElement>(host, '[aria-label="退出阅读"]').click()
    await settle()
    expect(host.querySelector("h2")).toBe(heading)
    expect(host.textContent).toContain("继续阅读（第 18 页）")
    expect(window.scrollY).toBe(450)
    expect(fetchGalleryComments).toHaveBeenCalledTimes(1)
    /* 进阅读器、回详情页各重读一次；回来时先等第 18 页的保存落地，读回的就是 18，详情页的 DOM 也不重建。 */
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(3)
    expect(saveProgress).toHaveBeenLastCalledWith(1, "aaaaaaaaaa", 18)
    await click("返回列表")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(host.querySelector("input")).toBe(input)
    expect(input.value).toBe("尚未提交")
    expect(window.scrollY).toBe(800)
    expect(searchGalleries).toHaveBeenCalledTimes(1)
  })

  it("阅读控件双向绑定页码，间隔按钮保存偏好，图片失败后可重试", async () => {
    await visit("/eh/read/1/aaaaaaaaaa/1")
    const viewport = query(host, '[aria-label="横向阅读区域"]')
    await vi.waitFor(() => expect(viewport.querySelector("img")).not.toBeNull())
    const image = query(viewport, "img")
    image.dispatchEvent(new Event("error"))
    await nextTick()
    expect(viewport.textContent).toContain("第 1 页加载失败")
    await click("重试")
    await settle()
    expect(query(viewport, "img").getAttribute("src")).toBe("/image/1/1?signed&r=1")

    const range = query<HTMLInputElement>(host, '[aria-label="阅读进度"]')
    range.value = "17"
    range.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    /* 控件当场就是新页码，地址栏随后节流跟上。 */
    expect(range.getAttribute("aria-valuetext")).toBe("第 17 页，共 100 页")
    await vi.waitFor(() => expect(router.currentRoute.value.params.page).toBe("17"))
    query<HTMLButtonElement>(host, '[aria-label="增加自动翻页间隔"]').click()
    await nextTick()
    expect(query(host, '[aria-label="自动翻页间隔"]').textContent.trim()).toBe("6 秒")
    await vi.waitFor(() => expect(patchGalleryPreferences).toHaveBeenCalledWith({ readerInterval: 6 }))
    query<HTMLElement>(host, '[aria-label="开始自动翻页"]').click()
    await nextTick()
    const pause = query<HTMLElement>(host, '[aria-label="暂停自动翻页"]')
    expect(pause.getAttribute("aria-pressed")).toBe("true")
    pause.click()
    await visit("/eh/read/1/aaaaaaaaaa/100")
    expect(range.value).toBe("100")
    expect(query<HTMLButtonElement>(host, '[aria-label="下一页"]').disabled).toBe(true)
    expect(query<HTMLButtonElement>(host, '[aria-label="开始自动翻页"]').disabled).toBe(true)
  })

  it("换图集复用一份详情但重置内容和位置，凭据变更淘汰缓存", async () => {
    await visit("/eh/g/1/aaaaaaaaaa")
    window.scrollTo({ top: 500 })
    await visit("/eh")
    await visit("/eh/g/2/bbbbbbbbbb")
    expect(host.textContent).toContain("测试图集2")
    expect(window.scrollY).toBe(0)
    expect(fetchGalleryComments).toHaveBeenCalledTimes(2)
    /* 换绑 e 站账号后受凭据影响的内容全部作废，界面状态和滚动位置不受牵连。 */
    void invalidateEhContent(useQueryCache(pinia))
    await settle()
    expect(fetchGalleryComments).toHaveBeenCalledTimes(3)
    await click("返回列表")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(searchGalleries).toHaveBeenCalledTimes(2)
  })

  it.each(["绑定", "解绑"])("%s只淘汰图库缓存，保留设置页", async (action) => {
    vi.mocked(fetchCredentialStatus).mockResolvedValue({ bound: true, memberId: "123", hasExAccess: false })
    vi.mocked(bindCredential).mockResolvedValue({ bound: true, memberId: "456", hasExAccess: true })
    vi.mocked(unbindCredential).mockResolvedValue({ bound: false, memberId: "", hasExAccess: false })
    await visit("/eh/g/1/aaaaaaaaaa")
    await visit("/")
    const home = query(host, ".page-content")
    await visit("/holiday")
    const holiday = query(host, ".page-content")
    await visit("/settings")
    const form = query(host, "form")
    if (action === "绑定") {
      const input = query<HTMLInputElement>(host, "#ipbMemberId")
      input.value = "456"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await nextTick()
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await settle()
    } else {
      await click("解绑")
      /* 解绑要先确认：点开的只是对话框，在对话框里再点一次才发请求。 */
      const confirmation = byText(document, '[role="alertdialog"] button', "解绑")
      confirmation.click()
      await settle()
    }
    const expectedBindCalls = action === "绑定" ? [[{ ipbMemberId: "456", ipbPassHash: "", igneous: "" }]] : []
    expect(vi.mocked(bindCredential).mock.calls).toEqual(expectedBindCalls)
    expect(unbindCredential).toHaveBeenCalledTimes(action === "解绑" ? 1 : 0)
    expect(host.textContent).toContain(action === "绑定" ? "绑定成功，里站已解锁。" : "未绑定")
    expect(query<HTMLInputElement>(host, "#ipbMemberId").value).toBe("")
    expect(host.querySelector("form")).toBe(form)
    await visit("/")
    expect(host.querySelector(".page-content")).toBe(home)
    await visit("/holiday")
    expect(host.querySelector(".page-content")).toBe(holiday)
    expect(fetchHolidayDetail).toHaveBeenCalledTimes(1)
    const credentialRequests = vi.mocked(fetchCredentialStatus).mock.calls.length
    await visit("/settings")
    expect(host.querySelector("form")).toBe(form)
    /* 回到设置页照常重读一次状态 */
    expect(fetchCredentialStatus).toHaveBeenCalledTimes(credentialRequests + 1)
    await visit("/eh")
    expect(searchGalleries).toHaveBeenCalledTimes(2)
    await visit("/eh/g/1/aaaaaaaaaa")
    /* 换绑当场让留着的详情页重读一次，回到详情页又重读一次 */
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(3)
    expect(fetchGalleryComments).toHaveBeenCalledTimes(2)
  })

  it("绑定失败保留输入和图库缓存，并恢复提交按钮", async () => {
    vi.mocked(fetchCredentialStatus).mockResolvedValue({ bound: false, memberId: "", hasExAccess: false })
    vi.mocked(bindCredential).mockRejectedValueOnce(new Error("凭据无效"))
    const listInput = host.querySelector("input")
    await visit("/settings")
    const form = query(host, "form")
    const input = query<HTMLInputElement>(host, "#ipbMemberId")
    input.value = "456"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
    expect(host.textContent).toContain("凭据无效")
    expect(input.value).toBe("456")
    expect(query<HTMLButtonElement>(form, 'button[type="submit"]').disabled).toBe(false)
    await visit("/eh")
    expect(host.querySelector("input")).toBe(listInput)
    expect(searchGalleries).toHaveBeenCalledTimes(1)
  })

  it("筛选草稿关闭不生效，应用才搜索；历史词沿用当前筛选条件", async () => {
    await enterKeyword("cat")
    await click("筛选")
    category("漫画").click()
    await settle()
    expect(searchGalleries).toHaveBeenCalledTimes(1)
    category("漫画").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await settle()
    expect(router.currentRoute.value.query.categories).toBeUndefined()
    await click("筛选")
    expect(category("漫画").getAttribute("aria-pressed")).toBe("false")
    category("漫画").click()
    await settle()
    category("应用").click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "cat", categories: ["manga"], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    expect(host.textContent).toContain("筛选 (1)")
    /* 两份数据各自只提交改了的那一项，界面不等它们。 */
    await vi.waitFor(() => {
      expect(patchGalleryPreferences).toHaveBeenCalledWith({ categories: ["manga"], minRating: null })
      expect(addSearchKeyword).toHaveBeenCalledWith("cat")
    })
    await enterKeyword("dog")
    await click("搜索")
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "dog", categories: ["manga"], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    await click("cat")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(query(host, "input").value).toBe("cat")
    /* 点历史词就是拿它配上当前筛选条件重新搜一次。 */
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "cat", categories: ["manga"], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
  })

  /* 搜索页开出的第一次查询要用偏好里的筛选条件：偏好没读到就停在布局层，不拿默认值放行。 */
  it("偏好读不到就停在布局层，重试读到后才放页面进来", async () => {
    vi.mocked(fetchGalleryPreferences).mockRejectedValueOnce(new Error("偏好读取失败"))
    /* 在图库里换个账号：页面整个重建，账号数据都要重新读，偏好这次读失败。 */
    const auth = useAuthStore()
    auth.logout()
    auth.user = { id: 2, username: "second" }
    await settle()
    expect(host.textContent).toContain("偏好读取失败")
    expect(host.querySelector('input[aria-label="搜索图集"]')).toBeNull()

    await click("重试")
    expect(host.textContent).not.toContain("偏好读取失败")
    expect(host.querySelector('input[aria-label="搜索图集"]')).not.toBeNull()
  })

  /* 搜索历史不挡页面：它读失败了，页面照常能搜，历史那一栏空着。 */
  it("搜索历史读不到也照常放页面进来", async () => {
    vi.mocked(fetchSearchHistory).mockRejectedValueOnce(new Error("历史读取失败"))
    const auth = useAuthStore()
    auth.logout()
    auth.user = { id: 2, username: "second" }
    await settle()
    expect(host.querySelector('input[aria-label="搜索图集"]')).not.toBeNull()
    expect(host.textContent).toContain("暂无搜索历史")
  })

  it("返回列表沿用本地那份偏好与历史，不再重读服务端", async () => {
    await enterKeyword("cat")
    await click("搜索")
    await enterKeyword("尚未提交")
    await visit("/eh/g/1/aaaaaaaaaa")
    const reads = vi.mocked(fetchGalleryPreferences).mock.calls.length
    vi.mocked(fetchGalleryPreferences).mockResolvedValue({ categories: ["manga"], minRating: null, readerInterval: 5 })
    vi.mocked(fetchSearchHistory).mockResolvedValue(["其他设备的搜索"])
    await click("返回列表")
    expect(host.querySelector("input")?.value).toBe("尚未提交")
    expect(host.textContent).not.toContain("其他设备的搜索")
    expect(host.textContent).toContain("cat")
    expect(fetchGalleryPreferences).toHaveBeenCalledTimes(reads)
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "cat", categories: [], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
  })

  it("提交失败不阻断本次搜索，以服务端为准重读，也不拿失败打扰用户", async () => {
    vi.mocked(patchGalleryPreferences).mockRejectedValue(new Error("断网"))
    vi.mocked(addSearchKeyword).mockRejectedValue(new Error("断网"))
    await enterKeyword("cat")
    await click("筛选")
    category("漫画").click()
    await settle()
    category("应用").click()
    await settle()
    expect(searchGalleries).toHaveBeenLastCalledWith(
      { keyword: "cat", categories: ["manga"], minRating: null, cursor: "" },
      expect.any(AbortSignal),
    )
    await vi.waitFor(() => expect(patchGalleryPreferences).toHaveBeenCalled())
    await settle()
    /* 存不上也不说；服务端那份没有这次改动，重读回来就照服务端的显示。 */
    expect(host.textContent).not.toContain("失败")
    expect(host.textContent).not.toContain("筛选 (1)")
    expect(host.querySelector('[title="cat"]')).toBeNull()
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
    /* 翻到哪本地就是哪，界面当场跟上；退出阅读时把还没发出的这一页补提交上去。 */
    expect(host.textContent).toContain("继续阅读（第 29 页）")
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "aaaaaaaaaa", 29)
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
})
