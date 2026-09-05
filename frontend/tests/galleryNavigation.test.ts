// @vitest-environment happy-dom
import { createPinia } from "pinia"
import { createApp, nextTick, type App as VueApp } from "vue"
import { createRouter, createWebHistory, type Router } from "vue-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import { AppRouter } from "@/router"
import { useAuthStore } from "@/stores/AuthStore"
import { fetchGalleryComments, fetchGalleryDetail, saveProgress, searchGalleries, type GalleryDetail } from "@/api/eh"

vi.mock("@/api/eh", async (original) => ({
  ...await original<typeof import("@/api/eh")>(),
  fetchGalleryComments: vi.fn(), fetchGalleryDetail: vi.fn(), saveProgress: vi.fn(), searchGalleries: vi.fn(),
}))

const gallery: GalleryDetail = {
  gid: 1, token: "aaaaaaaaaa", title: "测试图集", titleJpn: "", category: "Manga", thumbnail: "/thumbnail",
  uploader: "作者", postedAt: "2026-09-05T00:00:00Z", fileCount: 100, rating: 4, tags: [],
  fileSize: 100, torrentCount: 0, expunged: false,
}
let app: VueApp
let router: Router
let host: HTMLElement

async function settle() {
  await vi.dynamicImportSettled()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await nextTick()
}
async function visit(path: string) { await router.push(path); await settle() }
async function enterKeyword(value: string) {
  const input = host.querySelector("input")!
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
}
async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLElement>("button, a")].find((element) => element.textContent?.trim() === text)
  expect(button, `${text}: ${router.currentRoute.value.fullPath}\n${host.textContent}`).toBeDefined()
  button!.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true, cancelable: true }))
  await settle()
}

beforeEach(async () => {
  vi.resetAllMocks()
  localStorage.clear()
  window.history.replaceState({}, "", "/")
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true })
  vi.spyOn(window, "scrollTo").mockImplementation((options: ScrollToOptions | number = 0) => {
    if (typeof options === "object") Object.defineProperty(window, "scrollY", { value: options.top ?? 0, writable: true, configurable: true })
  })
  vi.mocked(searchGalleries).mockResolvedValue({ items: [gallery], nextCursor: null })
  vi.mocked(fetchGalleryDetail).mockImplementation(async (gid, token) => ({
    gallery: { ...gallery, gid, token, title: `测试图集${gid}` }, progress: 3, imageUrlTemplate: "/image/{page}",
  }))
  vi.mocked(fetchGalleryComments).mockResolvedValue([])
  vi.mocked(saveProgress).mockResolvedValue(null)
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.user = { id: 1, username: "tester" }
  auth.ready = true
  router = createRouter({ history: createWebHistory(), routes: AppRouter.options.routes, scrollBehavior: AppRouter.options.scrollBehavior })
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
  router.options.history.destroy()
  host.remove()
  vi.restoreAllMocks()
})

describe("图库组件缓存闭环", () => {
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
    expect(localStorage.getItem("myapi.search-history.1")).toBe("[]")
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
    await settle()
    host.querySelector<HTMLElement>('[aria-label="退出阅读"]')!.click()
    await settle()
    expect(host.querySelector("h2")).toBe(heading)
    expect(host.textContent).toContain("继续阅读（第 18 页）")
    expect(window.scrollY).toBe(450)
    expect(fetchGalleryComments).toHaveBeenCalledTimes(1)
    expect(fetchGalleryDetail).toHaveBeenCalledTimes(2)
    expect(saveProgress).toHaveBeenLastCalledWith(1, "aaaaaaaaaa", 18)
    await click("返回列表")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(host.querySelector("input")).toBe(input)
    expect(input.value).toBe("尚未提交")
    expect(window.scrollY).toBe(800)
    expect(searchGalleries).toHaveBeenCalledTimes(1)
  })

  it("换图集复用一份详情但重置内容和位置，凭据变更淘汰缓存", async () => {
    await visit("/eh/g/1/aaaaaaaaaa")
    window.scrollTo({ top: 500 })
    await visit("/eh")
    await visit("/eh/g/2/bbbbbbbbbb")
    expect(host.textContent).toContain("测试图集2")
    expect(window.scrollY).toBe(0)
    expect(fetchGalleryComments).toHaveBeenCalledTimes(2)
    useAuthStore().invalidateGalleries()
    await settle()
    expect(fetchGalleryComments).toHaveBeenCalledTimes(3)
    await click("返回列表")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(searchGalleries).toHaveBeenCalledTimes(2)
  })

  it("分类草稿关闭不生效，应用才搜索；历史词沿用当前分类", async () => {
    await enterKeyword("cat")
    await click("分类")
    const category = (text: string) => [...document.querySelectorAll<HTMLElement>("button")].find((node) => node.textContent?.trim() === text)!
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
    expect(searchGalleries).toHaveBeenLastCalledWith({ keyword: "cat", categories: ["manga"], cursor: "" }, expect.any(AbortSignal))
    expect(localStorage.getItem("myapi.gallery-categories.1")).toBe('["manga"]')
    expect(host.textContent).toContain("分类 (1)")
    expect(localStorage.getItem("myapi.search-history.1")).toBe('["cat"]')
    await enterKeyword("dog")
    await click("搜索")
    await click("cat")
    expect(router.currentRoute.value.fullPath).toBe("/eh")
    expect(searchGalleries).toHaveBeenLastCalledWith({ keyword: "cat", categories: ["manga"], cursor: "" }, expect.any(AbortSignal))
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
    expect(host.textContent).toContain("继续阅读（第 29 页）")
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
    const category = (text: string) => [...document.querySelectorAll<HTMLElement>("button")].find((node) => node.textContent?.trim() === text)!
    category("漫画").click()
    await settle()
    category("应用").click()
    await settle()
    // 模拟刷新后的全新页面实例，而非 KeepAlive 激活。
    useAuthStore().sessionRevision += 1
    await settle()
    expect(host.querySelector("input")?.value).toBe("")
    expect(host.textContent).toContain("分类 (1)")
    expect(searchGalleries).toHaveBeenLastCalledWith({ keyword: "", categories: ["manga"], cursor: "" }, expect.any(AbortSignal))
    await click("cat")
    expect(host.querySelector("input")?.value).toBe("cat")
    expect(searchGalleries).toHaveBeenLastCalledWith({ keyword: "cat", categories: ["manga"], cursor: "" }, expect.any(AbortSignal))
  })
})
