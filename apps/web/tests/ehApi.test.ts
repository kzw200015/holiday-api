/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  addSearchKeyword,
  clearSearchHistory,
  fetchGalleryPreferences,
  patchGalleryPreferences,
  removeSearchKeyword,
  saveProgress,
} from "@/features/eh/api"
import { present } from "./support"

/* 与 api.ts 里的 SAVE_TIMEOUT 对齐。 */
const SAVE_TIMEOUT = 10_000

/* 挂住的连接：永远不回，只在被中止时失败。Eden 按 fetch(地址, 选项) 调用 */
const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
  (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason))
    }),
)

beforeEach(() => {
  vi.useFakeTimers()
  fetch.mockClear()
  vi.stubGlobal("fetch", fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/* 同一类的保存前一次不回来，后面的就都不发；读之前也要等在途的保存落地。一次挂住的请求不能把它们全部卡死。 */
describe("写入的时限", () => {
  it.each([
    { label: "进度", save: () => saveProgress(1, "aaaaaaaaaa", 2) },
    { label: "偏好", save: () => patchGalleryPreferences({ readerInterval: 5 }) },
    { label: "记搜索历史", save: () => addSearchKeyword("猫") },
    { label: "删搜索历史", save: () => removeSearchKeyword("猫") },
    { label: "清空搜索历史", save: () => clearSearchHistory() },
  ])("$label的保存挂住就按时限中止", async ({ save }) => {
    const outcome = save().then(
      () => "成功",
      (error: Error) => error.message,
    )
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT - 1)
    expect(fetch.mock.calls[0]?.[1].signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await outcome).toBe("请求超时")
  })

  it("读取不受这个时限约束", async () => {
    void fetchGalleryPreferences()
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT * 3)
    expect(fetch.mock.calls[0]?.[1].signal?.aborted ?? false).toBe(false)
  })

  /* 刷新、关标签页时发出的那次进度要能在页面卸载后继续送完。 */
  it("进度保存带 keepalive", async () => {
    void saveProgress(1, "aaaaaaaaaa", 2).catch(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ keepalive: true })
  })
})

/* 进度上报不排队，同一本的两次可能乱序到达：服务端靠这两个字段只认同一上报方更新的那次。 */
describe("进度上报的顺序", () => {
  it("带同一个上报方标识和递增的序号", async () => {
    void saveProgress(1, "aaaaaaaaaa", 2).catch(() => {})
    void saveProgress(1, "aaaaaaaaaa", 3).catch(() => {})
    await vi.advanceTimersByTimeAsync(0)
    const [first, second] = fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(first).toMatchObject({
      gid: 1,
      token: "aaaaaaaaaa",
      page: 2,
      writer: expect.stringMatching(/^[0-9a-f]{32}$/),
    })
    expect(second).toMatchObject({ page: 3, writer: first.writer })
    expect(second.seq).toBeGreaterThan(first.seq)
  })
})

/* 要删的词可能是 `..` 这类放进路径会被规范化掉的写法，所以放查询串。 */
describe("删搜索历史的地址", () => {
  it("关键词编进查询串", async () => {
    void removeSearchKeyword("../a b").catch(() => {})
    await vi.advanceTimersByTimeAsync(0)
    const url = new URL(present(fetch.mock.calls[0], "请求")[0])
    expect([url.pathname, url.searchParams.get("keyword")]).toEqual(["/api/eh/search-history/entry", "../a b"])
  })
})
