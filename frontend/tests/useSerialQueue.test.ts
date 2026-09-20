import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { effectScope } from "vue"

import { useSerialQueue } from "@/shared/composables/useSerialQueue"

let scope: ReturnType<typeof effectScope>
let queue: ReturnType<typeof useSerialQueue>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  scope = effectScope()
  queue = scope.run(useSerialQueue)!
})
afterEach(() => scope.stop())

describe("串行请求队列", () => {
  it("前一请求及状态提交完成后，才开始下一请求，并返回各自结果", async () => {
    const pending = deferred<number>()
    const events: string[] = []
    const first = queue.run(
      async () => {
        events.push("请求一")
        return pending.promise
      },
      (result) => events.push(`提交${result}`),
    )
    const second = queue.run(
      async () => {
        events.push("请求二")
        return 2
      },
      (result) => events.push(`提交${result}`),
    )
    await Promise.resolve()
    expect(events).toEqual(["请求一"])
    pending.resolve(1)
    expect(await Promise.all([first, second])).toEqual([1, 2])
    expect(events).toEqual(["请求一", "提交1", "请求二", "提交2"])
  })

  it("请求或提交失败向调用方报错，但不破坏队列", async () => {
    const applied: number[] = []
    const failedRequest = queue.run(
      async () => {
        throw new Error("请求失败")
      },
      (result) => applied.push(result),
    )
    await expect(failedRequest).rejects.toThrow("请求失败")
    const failedApply = queue.run(
      async () => 1,
      () => {
        throw new Error("提交失败")
      },
    )
    await expect(failedApply).rejects.toThrow("提交失败")
    await queue.run(
      async () => 2,
      (result) => applied.push(result),
    )
    expect(applied).toEqual([2])
  })

  it("取消排队中的任务后不发送请求，其后的任务仍可执行", async () => {
    const pending = deferred<number>()
    const first = queue.run(
      () => pending.promise,
      () => {},
    )
    const controller = new AbortController()
    const events: string[] = []
    const canceled = queue.run(
      async () => {
        events.push("已取消的请求")
        return 2
      },
      () => events.push("已取消的提交"),
      controller.signal,
    )
    const rejected = canceled.catch((error: unknown) => error)
    const last = queue.run(
      async () => 3,
      () => events.push("最后的提交"),
    )
    controller.abort()
    pending.resolve(1)
    await first
    expect(await rejected).toMatchObject({ name: "AbortError" })
    await last
    expect(events).toEqual(["最后的提交"])
  })

  it("取消在途请求会传递信号，忽略取消的迟到结果也不会提交", async () => {
    const pending = deferred<number>()
    const controller = new AbortController()
    let requestSignal: AbortSignal | undefined
    let value = 0
    const operation = queue.run(
      (signal) => {
        requestSignal = signal
        return pending.promise
      },
      (result) => {
        value = result
      },
      controller.signal,
    )
    const rejected = operation.catch((error: unknown) => error)
    await Promise.resolve()
    controller.abort()
    expect(requestSignal?.aborted).toBe(true)
    pending.resolve(1)
    expect(await rejected).toMatchObject({ name: "AbortError" })
    expect(value).toBe(0)
  })

  it("重置后新任务不等待旧响应，旧结果与旧队列都不能污染新状态", async () => {
    const pending = deferred<string>()
    let value = ""
    let queuedRequestStarted = false
    const old = queue.run(
      () => pending.promise,
      (result) => {
        value = result
      },
    )
    const queued = queue.run(
      async () => {
        queuedRequestStarted = true
        return "旧队列"
      },
      (result) => {
        value = result
      },
    )
    const oldRejected = old.catch((error: unknown) => error)
    const queuedRejected = queued.catch((error: unknown) => error)
    await Promise.resolve()
    queue.reset()
    await queue.run(
      async () => "新状态",
      (result) => {
        value = result
      },
    )
    expect(value).toBe("新状态")
    pending.resolve("迟到的旧状态")
    expect(await oldRejected).toMatchObject({ name: "AbortError" })
    expect(await queuedRejected).toMatchObject({ name: "AbortError" })
    expect(value).toBe("新状态")
    expect(queuedRequestStarted).toBe(false)
  })

  it("作用域销毁后不提交在途结果", async () => {
    const pending = deferred<number>()
    let applied = false
    const operation = queue.run(
      () => pending.promise,
      () => {
        applied = true
      },
    )
    const rejected = operation.catch((error: unknown) => error)
    await Promise.resolve()
    scope.stop()
    pending.resolve(1)
    expect(await rejected).toMatchObject({ name: "AbortError" })
    expect(applied).toBe(false)
  })
})
