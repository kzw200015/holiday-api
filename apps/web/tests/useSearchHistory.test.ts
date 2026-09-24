/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as EhApi from "@/features/eh/api"
import { addSearchKeyword, clearSearchHistory, fetchSearchHistory, removeSearchKeyword } from "@/features/eh/api"
import { useSearchHistory } from "@/features/eh/composables/useSearchHistory"
import { composableTests, deferred, settleFakeTimers } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchSearchHistory: vi.fn(),
  addSearchKeyword: vi.fn(),
  removeSearchKeyword: vi.fn(),
  clearSearchHistory: vi.fn(),
}))

const t = composableTests()
const mount = () => t.mount(useSearchHistory)

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.mocked(fetchSearchHistory).mockResolvedValue(["猫", "狗"])
  vi.mocked(addSearchKeyword).mockResolvedValue(null)
  vi.mocked(removeSearchKeyword).mockResolvedValue(null)
  vi.mocked(clearSearchHistory).mockResolvedValue(null)
})
afterEach(() => {
  vi.useRealTimers()
})

/* 排序、去重、留几条由服务端落库，本地按共享包里的同一条规则当场改好，一次只提交一个词。 */
describe("账号搜索历史", () => {
  it("新搜的排最前，同一个词只留一条；每次只提交这一个词", async () => {
    const history = mount()
    await settleFakeTimers()
    history.record("鸟")
    expect(history.entries.value).toEqual(["鸟", "猫", "狗"])
    history.record("狗")
    expect(history.entries.value).toEqual(["狗", "鸟", "猫"])
    await settleFakeTimers()
    expect(vi.mocked(addSearchKeyword).mock.calls).toEqual([["鸟"], ["狗"]])
  })

  it("最多留十条，更早的挤出去", async () => {
    vi.mocked(fetchSearchHistory).mockResolvedValue([])
    const history = mount()
    await settleFakeTimers()
    for (let index = 1; index <= 12; index++) {
      history.record(`词${index}`)
    }
    expect(history.entries.value).toHaveLength(10)
    expect(history.entries.value[0]).toBe("词12")
    expect(history.entries.value).not.toContain("词1")
  })

  /* 后端拒收超过 200 字节的关键词；记了本地也会被重读按回去。 */
  it("超长关键词不记", async () => {
    const history = mount()
    await settleFakeTimers()
    history.record("长".repeat(67))
    await settleFakeTimers()
    expect(history.entries.value).toEqual(["猫", "狗"])
    expect(addSearchKeyword).not.toHaveBeenCalled()
    history.record("长".repeat(66))
    expect(history.entries.value[0]).toBe("长".repeat(66))
  })

  it("读失败不算就绪", async () => {
    vi.mocked(fetchSearchHistory).mockRejectedValueOnce(new Error("断网"))
    const history = mount()
    await settleFakeTimers()
    expect(history.ready.value).toBe(false)
    expect(history.loadError.value).toBe("断网")
    history.reload()
    await settleFakeTimers()
    expect(history.ready.value).toBe(true)
  })

  it("删除与清空当场生效，各自提交；先记后删同一个词按操作顺序发出", async () => {
    const history = mount()
    await settleFakeTimers()
    const adding = deferred<null>()
    vi.mocked(addSearchKeyword).mockReturnValueOnce(adding.promise)
    history.record("鸟")
    history.remove("鸟")
    expect(history.entries.value).toEqual(["猫", "狗"])
    await settleFakeTimers()
    expect(removeSearchKeyword).not.toHaveBeenCalled()
    adding.resolve(null)
    await settleFakeTimers()
    expect(removeSearchKeyword).toHaveBeenCalledExactlyOnceWith("鸟")

    history.clear()
    expect(history.entries.value).toEqual([])
    await settleFakeTimers()
    expect(clearSearchHistory).toHaveBeenCalledTimes(1)
  })

  it("存不上就重读一次，以服务端为准", async () => {
    vi.mocked(removeSearchKeyword).mockRejectedValueOnce(new Error("断网"))
    const history = mount()
    await settleFakeTimers()
    history.remove("猫")
    expect(history.entries.value).toEqual(["狗"])
    await settleFakeTimers()
    expect(fetchSearchHistory).toHaveBeenCalledTimes(2)
    expect(history.entries.value).toEqual(["猫", "狗"])
  })

  /* 改动只提交一个词，没读到也能安全地提交；在途那次读取带回的是记之前的列表，记完再读一次。 */
  it("没读到时也照样提交，提交之后重读，这个词不会丢", async () => {
    const loading = deferred<string[]>()
    /* 第一次读取在途；之后再读，服务端那份已经有这个词了 */
    vi.mocked(fetchSearchHistory).mockReturnValueOnce(loading.promise).mockResolvedValue(["鸟", "猫", "狗"])
    const history = mount()
    await settleFakeTimers()
    history.record("鸟")
    await settleFakeTimers()
    expect(addSearchKeyword).toHaveBeenCalledExactlyOnceWith("鸟")
    loading.resolve(["猫", "狗"])
    await settleFakeTimers()
    expect(history.entries.value).toEqual(["鸟", "猫", "狗"])
  })

  it("本地改动之后，之前还在途的读取不再落地", async () => {
    const history = mount()
    await settleFakeTimers()
    const loading = deferred<string[]>()
    vi.mocked(fetchSearchHistory).mockReturnValueOnce(loading.promise)
    history.reload()
    history.remove("猫")
    loading.resolve(["猫", "狗"])
    await settleFakeTimers()
    expect(history.entries.value).toEqual(["狗"])
  })
})
