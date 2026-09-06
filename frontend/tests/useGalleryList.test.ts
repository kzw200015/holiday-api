import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope, reactive, type EffectScope } from "vue"

import * as authApi from "@/api/auth"
import { searchGalleries, type GalleryCard, type GalleryPage } from "@/api/eh"
import { useGalleryList } from "@/composables/useGalleryList"
import { useAuthStore } from "@/stores/AuthStore"

let scope: EffectScope
const createList = () => scope.run(() => reactive(useGalleryList()))!

vi.mock("@/api/eh", () => ({ searchGalleries: vi.fn() }))
vi.mock("@/api/auth", () => ({ authenticate: vi.fn(), fetchCurrentUser: vi.fn() }))

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
  let resolve!: (value: GalleryPage) => void
  let reject!: (error: Error) => void
  const promise = new Promise<GalleryPage>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  scope = effectScope()
  setActivePinia(createPinia())
  vi.resetAllMocks()
})
afterEach(() => scope.stop())

describe("图库列表", () => {
  it("翻页携带原查询；错误暂停自动加载，手动重试沿用失败游标", async () => {
    search.mockResolvedValueOnce({ items: [card(1)], nextCursor: "next" })
    const store = createList()
    await store.search(query)
    search.mockRejectedValueOnce(new Error("上游限速"))
    await store.loadMore()
    await store.loadMore()
    expect(search).toHaveBeenCalledTimes(2)
    expect(store.hasMore).toBe(true)
    expect(store.errorMessage).toBe("上游限速")
    search.mockResolvedValueOnce({ items: [card(2)], nextCursor: null })
    await store.retry()
    expect(search).toHaveBeenLastCalledWith({ ...query, cursor: "next" }, expect.any(AbortSignal))
    expect(store.items.map(({ gid }) => gid)).toEqual([1, 2])
    expect(store.hasMore).toBe(false)
    expect(store.errorMessage).toBe("")
    await store.loadMore()
    expect(search).toHaveBeenCalledTimes(3)
  })

  it("切换搜索立即开始新请求，并丢弃旧响应", async () => {
    const old = deferredPage()
    search.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [card(2)], nextCursor: null })
    const store = createList()
    const first = store.search(query)
    await store.search({ keyword: "new", categories: [] })
    expect(search.mock.calls[0][1]?.aborted).toBe(true)
    old.resolve({ items: [card(1)], nextCursor: "old-next" })
    await first
    expect(store.items.map(({ gid }) => gid)).toEqual([2])
    expect(store.hasMore).toBe(false)
  })

  it("旧请求失败不改变新请求的加载状态", async () => {
    const old = deferredPage()
    const current = deferredPage()
    search.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const store = createList()
    const first = store.search(query)
    const second = store.search({ keyword: "new", categories: [] })
    old.reject(new Error("旧请求失败"))
    await first
    expect(store.loading).toBe(true)
    expect(store.errorMessage).toBe("")
    current.resolve({ items: [card(2)], nextCursor: null })
    await second
    expect(store.loading).toBe(false)
  })

  it("返回相同条件复用缓存，分类顺序与重复项不影响查询身份", async () => {
    search.mockResolvedValue({ items: [card(1)], nextCursor: null })
    const store = createList()
    await store.search({ keyword: "a|b", categories: ["manga", "doujinshi", "manga"] })
    await store.search({ keyword: "a|b", categories: ["doujinshi", "manga"] })
    expect(search).toHaveBeenCalledTimes(1)
    expect(store.items).toHaveLength(1)
  })

  it("同一页加载期间再次触底不会重复请求", async () => {
    const pending = deferredPage()
    search.mockReturnValue(pending.promise)
    const store = createList()
    const first = store.search(query)
    await store.loadMore()
    expect(search).toHaveBeenCalledTimes(1)
    pending.resolve({ items: [], nextCursor: null })
    await first
  })

  it("组件销毁会取消在途请求，迟到响应不能恢复已清除的缓存", async () => {
    const pending = deferredPage()
    search.mockReturnValueOnce(pending.promise)
    const store = createList()
    const loading = store.search(query)
    scope.stop()
    pending.resolve({ items: [card(1)], nextCursor: "next" })
    await loading
    expect(store.items).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.hasMore).toBe(false)
  })

  it("登录、退出与凭据变化都让图库缓存失效", async () => {
    const auth = useAuthStore()
    vi.mocked(authApi.authenticate).mockResolvedValue({ token: "new-token", user: { id: 2, username: "second" } })
    const before = auth.galleryRevision
    await auth.authenticate("login", "second", "password")
    auth.invalidateGalleries()
    auth.logout()
    expect(auth.galleryRevision).toBe(before + 3)
  })
})
