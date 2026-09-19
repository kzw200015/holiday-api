import { describe, expect, it, vi } from "vitest"
import { effectScope } from "vue"

import { useAsyncAction } from "@/composables/useAsyncAction"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe("页面操作状态", () => {
  it("成功提交结果并复位状态，失败写入指定文案", async () => {
    const scope = effectScope()
    const action = scope.run(() => useAsyncAction({ failureMessage: "保存失败" }))!
    const applied: string[] = []

    expect(await action.run(async () => "第一次", { apply: (value) => applied.push(value) })).toBe(true)
    expect(applied).toEqual(["第一次"])
    expect(action.pending.value).toBe(false)
    expect(action.errorMessage.value).toBe("")

    expect(
      await action.run(() => Promise.reject(new Error("原始信息")), {
        apply: (value: unknown) => applied.push(String(value)),
      }),
    ).toBe(false)
    expect(applied).toEqual(["第一次"])
    expect(action.errorMessage.value).toBe("保存失败")
    expect(action.pending.value).toBe(false)
    scope.stop()
  })

  it("没有指定文案时沿用错误自身的说明，重试前清空上一次的错误", async () => {
    const scope = effectScope()
    const action = scope.run(() => useAsyncAction())!

    await action.run(() => Promise.reject(new Error("断网了")))
    expect(action.errorMessage.value).toBe("断网了")

    const running = action.run(async () => "好了")
    expect(action.errorMessage.value).toBe("")
    expect(action.pending.value).toBe(true)
    await running
    expect(action.pending.value).toBe(false)
    scope.stop()
  })

  it("旧的一次结果不能覆盖新的一次，也不能提前关掉它的进行中状态", async () => {
    const scope = effectScope()
    const action = scope.run(() => useAsyncAction())!
    const first = deferred<string>()
    const second = deferred<string>()
    const applied: string[] = []
    const apply = (value: string) => applied.push(value)

    const running = [action.run(() => first.promise, { apply }), action.run(() => second.promise, { apply })]
    second.resolve("第二次")
    first.resolve("第一次")
    expect(await Promise.all(running)).toEqual([false, true])
    expect(applied).toEqual(["第二次"])
    expect(action.pending.value).toBe(false)

    /* 迟到的失败同样不能把界面弄脏。 */
    const stale = deferred<string>()
    const fresh = action.run(() => stale.promise, { apply })
    const latest = action.run(async () => "最新")
    stale.reject(new Error("迟到的失败"))
    await Promise.all([fresh, latest])
    expect(action.errorMessage.value).toBe("")
    scope.stop()
  })

  it("latestOnly 取消上一次在途请求，普通操作让它跑完", async () => {
    const scope = effectScope()
    const reader = scope.run(() => useAsyncAction({ latestOnly: true }))!
    const writer = scope.run(() => useAsyncAction())!
    const request = vi.fn((signal: AbortSignal) => {
      void signal
      return new Promise<string>(() => {})
    })

    void reader.run(request)
    void reader.run(request)
    expect(request.mock.calls[0]![0]!.aborted).toBe(true)
    expect(request.mock.calls[1]![0]!.aborted).toBe(false)

    const writes = vi.fn((signal: AbortSignal) => {
      void signal
      return new Promise<string>(() => {})
    })
    void writer.run(writes)
    void writer.run(writes)
    expect(writes.mock.calls[0]![0]!.aborted).toBe(false)
    scope.stop()
  })

  it("作用域结束后取消在途请求，迟到的结果不再提交", async () => {
    const scope = effectScope()
    const action = scope.run(() => useAsyncAction())!
    const pending = deferred<string>()
    const applied: string[] = []
    const request = vi.fn((signal: AbortSignal) => {
      void signal
      return pending.promise
    })

    const running = action.run(request, { apply: (value) => applied.push(value) })
    scope.stop()
    expect(request.mock.calls[0]![0]!.aborted).toBe(true)
    pending.resolve("迟到的结果")
    expect(await running).toBe(false)
    expect(applied).toEqual([])
    expect(action.errorMessage.value).toBe("")
  })

  it("取消不算失败，界面上不留报错", async () => {
    const scope = effectScope()
    const action = scope.run(() => useAsyncAction({ failureMessage: "读取失败" }))!

    const canceled = action.run(() => Promise.reject(new DOMException("aborted", "AbortError")))
    expect(await canceled).toBe(false)
    expect(action.errorMessage.value).toBe("")
    expect(action.pending.value).toBe(false)
    scope.stop()
  })
})
