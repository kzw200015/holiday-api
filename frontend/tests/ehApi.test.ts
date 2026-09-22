/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchGalleryPreferences, saveGalleryPreferences, saveProgress, saveSearchHistory } from "@/features/eh/api"

/* 与 api.ts 里的 SAVE_TIMEOUT 对齐。 */
const SAVE_TIMEOUT = 10_000

/* 挂住的连接：永远不回，只在被中止时失败。 */
const fetch = vi.fn<(request: Request, init?: RequestInit) => Promise<Response>>(
  (request) =>
    new Promise((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(request.signal.reason))
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

/* 排队的保存前一次不回来，后面的就都不发；一次挂住的请求不能把之后的保存全部卡死。 */
describe("排队写入的时限", () => {
  it.each([
    { label: "进度", save: () => saveProgress(1, "aaaaaaaaaa", 2) },
    { label: "偏好", save: () => saveGalleryPreferences({ categories: [], readerInterval: 5 }) },
    { label: "搜索历史", save: () => saveSearchHistory(["猫"]) },
  ])("$label的保存挂住就按时限中止", async ({ save }) => {
    const outcome = save().then(
      () => "成功",
      (error: Error) => error.message,
    )
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT - 1)
    expect(fetch.mock.calls[0]![0].signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await outcome).toBe("请求超时")
  })

  it("读取不受这个时限约束", async () => {
    void fetchGalleryPreferences()
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT * 3)
    expect(fetch.mock.calls[0]![0].signal.aborted).toBe(false)
  })
})
