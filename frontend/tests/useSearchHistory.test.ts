/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope } from "vue"

import { clearSearchHistory, fetchSearchHistory, recordSearch, removeSearch } from "@/api/eh"
import { useSearchHistory } from "@/composables/useSearchHistory"

vi.mock("@/api/eh", () => ({
  fetchSearchHistory: vi.fn(),
  recordSearch: vi.fn(),
  removeSearch: vi.fn(),
  clearSearchHistory: vi.fn(),
}))

const scopes: ReturnType<typeof effectScope>[] = []
function createHistory() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(useSearchHistory)!
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchSearchHistory).mockResolvedValue(["cat"])
  vi.mocked(recordSearch).mockResolvedValue(["dog", "cat"])
  vi.mocked(removeSearch).mockResolvedValue(["dog"])
  vi.mocked(clearSearchHistory).mockResolvedValue(null)
})
afterEach(() => {
  for (const scope of scopes.splice(0)) {
    scope.stop()
  }
})

describe("账号搜索历史", () => {
  it("读取服务端历史，只提交添加、删除、清空操作", async () => {
    const history = createHistory()
    await history.load()
    expect(history.entries.value).toEqual(["cat"])
    await history.record("   ")
    expect(recordSearch).not.toHaveBeenCalled()
    await history.record(" dog ")
    expect(recordSearch).toHaveBeenCalledExactlyOnceWith("dog")
    expect(history.entries.value).toEqual(["dog", "cat"])
    await history.remove("cat")
    expect(removeSearch).toHaveBeenCalledExactlyOnceWith("cat")
    expect(history.entries.value).toEqual(["dog"])
    await history.clear()
    expect(clearSearchHistory).toHaveBeenCalledExactlyOnceWith()
    expect(history.entries.value).toEqual([])
  })

  it("保存或删除失败保留已确认历史并提示，不阻断搜索也不自动重试", async () => {
    const history = createHistory()
    await history.load()
    vi.mocked(recordSearch).mockRejectedValue(new Error("断网"))
    await history.record("dog")
    expect(history.entries.value).toEqual(["cat"])
    expect(history.errorMessage.value).toContain("保存失败")
    expect(recordSearch).toHaveBeenCalledTimes(1)
    vi.mocked(clearSearchHistory).mockRejectedValue(new Error("断网"))
    await history.clear()
    expect(history.entries.value).toEqual(["cat"])
    expect(history.errorMessage.value).toContain("清空搜索历史失败")
    expect(history.loading.value).toBe(false)
  })

  it("迟到的读取响应不能覆盖刚完成的删除", async () => {
    let resolve!: (value: string[]) => void
    vi.mocked(fetchSearchHistory).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const history = createHistory()
    const load = history.load()
    await history.clear()
    resolve(["cat"])
    await load
    expect(history.entries.value).toEqual([])
  })

  it("卸载后取消读取，旧响应不恢复历史", async () => {
    let resolve!: (value: string[]) => void
    vi.mocked(fetchSearchHistory).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const history = createHistory()
    const load = history.load()
    scopes.at(-1)!.stop()
    expect(vi.mocked(fetchSearchHistory).mock.calls[0]![0]!.aborted).toBe(true)
    resolve(["cat"])
    await load
    expect(history.entries.value).toEqual([])
  })
})
