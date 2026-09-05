import { effectScope, nextTick, ref } from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { saveProgress } from "@/api/eh"
import { useReadingProgress } from "@/composables/useReadingProgress"

vi.mock("@/api/eh", () => ({ saveProgress: vi.fn().mockResolvedValue(null) }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(saveProgress).mockClear()
})
afterEach(() => vi.useRealTimers())

describe("阅读进度", () => {
  it("连续翻页只上报最后一页，离开时立即补报并取消计时", async () => {
    const current = ref({ gid: 1, token: "first", page: 1 })
    const scope = effectScope()
    scope.run(() => useReadingProgress(current))
    current.value = { ...current.value, page: 2 }
    await nextTick()
    await vi.advanceTimersByTimeAsync(500)
    expect(saveProgress).not.toHaveBeenCalled()
    current.value = { ...current.value, page: 3 }
    await nextTick()
    scope.stop()
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(1, "first", 3)
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveProgress).toHaveBeenCalledTimes(1)
  })

  it("切换图集时按原图集快照补报，不会把新图集页码写给旧图集", async () => {
    const current = ref({ gid: 1, token: "first", page: 8 })
    const scope = effectScope()
    scope.run(() => useReadingProgress(current))
    current.value = { gid: 2, token: "second", page: 1 }
    await nextTick()
    expect(saveProgress).toHaveBeenNthCalledWith(1, 1, "first", 8)
    await vi.advanceTimersByTimeAsync(1200)
    expect(saveProgress).toHaveBeenNthCalledWith(2, 2, "second", 1)
    scope.stop()
    expect(saveProgress).toHaveBeenCalledTimes(2)
  })
})
