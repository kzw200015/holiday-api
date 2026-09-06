import { describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, ref } from "vue"

import { useQuery } from "@/composables/useQuery"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe("页面查询", () => {
  it("快速切换参数时取消旧请求，迟到结果不能覆盖当前结果", async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const request = vi
      .fn((_value: string, _signal: AbortSignal) => first.promise)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const selected = ref("first")
    const scope = effectScope()
    const state = scope.run(() => useQuery(selected, request))!
    selected.value = "second"
    await nextTick()
    expect(request.mock.calls[0][1].aborted).toBe(true)
    second.resolve("second result")
    await second.promise
    first.resolve("stale result")
    await first.promise
    expect(state.data.value).toBe("second result")
    expect(state.error.value).toBeNull()
    expect(state.loading.value).toBe(false)
    scope.stop()
  })

  it("旧请求失败不能提前结束新请求的加载状态", async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const selected = ref("first")
    const scope = effectScope()
    const state = scope.run(() => useQuery(selected, request))!
    selected.value = "second"
    await nextTick()
    first.reject(new Error("旧请求失败"))
    await first.promise.catch(() => {})
    expect(state.error.value).toBeNull()
    expect(state.loading.value).toBe(true)
    second.reject(new Error("当前请求失败"))
    await second.promise.catch(() => {})
    expect(state.error.value?.message).toBe("当前请求失败")
    expect(state.loading.value).toBe(false)
    scope.stop()
  })

  it("卸载取消请求，不再接收结果", async () => {
    const pending = deferred<string>()
    const request = vi.fn((_value: string, _signal: AbortSignal) => pending.promise)
    const scope = effectScope()
    const state = scope.run(() => useQuery(() => "gallery", request))!
    scope.stop()
    expect(request.mock.calls[0][1].aborted).toBe(true)
    pending.resolve("result")
    await pending.promise
    expect(state.data.value).toBeNull()
  })
})
