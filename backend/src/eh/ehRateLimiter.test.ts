import { describe, expect, test } from "bun:test"
import { isEhFailure } from "./ehFailure"
import { createEhRateLimiter } from "./ehRateLimiter"

/**
 * 限速器用真实定时器配小间隔来测：数值都压到几十毫秒，跑完一个用例也就一两百毫秒，
 * 比起假定时器少一层与实现耦合的假设。
 */
describe("ehRateLimiter", () => {
  /** 建一个各项都很小的限速器，参数按用例覆盖。 */
  function limiter(overrides: Partial<Parameters<typeof createEhRateLimiter>[0]> = {}) {
    return createEhRateLimiter({
      htmlMinIntervalMs: 50,
      // 抖动置零，否则断言时间会飘
      htmlJitterMs: 0,
      apiBurst: 2,
      apiWindowMs: 100,
      imageConcurrency: 2,
      banCooldownMs: 1000,
      ...overrides,
    })
  }

  /** 记录任务的开始时刻与并发峰值。 */
  function tracker() {
    const startedAt: number[] = []
    let running = 0
    let peak = 0
    const begin = Date.now()
    return {
      startedAt,
      peak: () => peak,
      task: (durationMs = 0) => async () => {
        startedAt.push(Date.now() - begin)
        running += 1
        peak = Math.max(peak, running)
        await Bun.sleep(durationMs)
        running -= 1
      },
    }
  }

  test("html 通道串行执行且相邻请求拉开最小间隔", async () => {
    const rate = limiter()
    const t = tracker()

    await Promise.all([0, 0, 0].map(() => rate.run("html", 1, t.task())))

    expect(t.peak()).toBe(1)
    // 三个请求之间要有两个 50ms 的间隔
    expect(t.startedAt[1] ?? 0).toBeGreaterThanOrEqual(45)
    expect(t.startedAt[2] ?? 0).toBeGreaterThanOrEqual(95)
  })

  test("api 通道按令牌桶放行：桶空了要等下一个窗口", async () => {
    const rate = limiter()
    const t = tracker()

    await Promise.all([0, 0, 0].map(() => rate.run("api", 1, t.task())))

    // 桶容量 2，前两个立刻走，第三个等到 100ms 的窗口刷新
    expect(t.startedAt[0] ?? 0).toBeLessThan(30)
    expect(t.startedAt[1] ?? 0).toBeLessThan(30)
    expect(t.startedAt[2] ?? 0).toBeGreaterThanOrEqual(95)
  })

  test("图片通道并发执行，不受 html 的间隔拖累", async () => {
    const rate = limiter()
    const t = tracker()

    await Promise.all([0, 0, 0, 0].map(() => rate.run("image", 1, t.task(30))))

    // 并发上限 2，四个任务分两批，总耗时约 60ms 而不是串行的 200ms
    expect(t.peak()).toBe(2)
    expect(t.startedAt[3] ?? 0).toBeLessThan(90)
  })

  test("排队时优先放行当前跑得最少的用户", async () => {
    const rate = limiter({ htmlMinIntervalMs: 10 })
    const order: number[] = []
    const record = (userId: number) => async () => {
      order.push(userId)
    }

    // 用户 1 一口气塞三个，用户 2 随后只来一个：不能让用户 2 干等到最后
    const pending = [
      rate.run("html", 1, record(1)),
      rate.run("html", 1, record(1)),
      rate.run("html", 1, record(1)),
      rate.run("html", 2, record(2)),
    ]
    await Promise.all(pending)

    expect(order.length).toBe(4)
    expect(order.indexOf(2)).toBeLessThan(3)
  })

  test("队列过长时直接拒绝而不是无限堆积", async () => {
    const rate = limiter({ htmlMinIntervalMs: 200, maxQueueLength: 2 })
    const settled: Promise<unknown>[] = []

    // 前面几个占住队列
    for (let i = 0; i < 3; i += 1) {
      settled.push(rate.run("html", 1, async () => Bun.sleep(1)).catch(() => undefined))
    }

    const rejected = await rate.run("html", 1, async () => undefined).then(
      () => null,
      (error: unknown) => error,
    )
    expect(isEhFailure(rejected) && rejected.ehKind).toBe("busy")

    await Promise.all(settled)
  })

  test("熔断后 html 与 api 立即失败，图片通道不受影响", async () => {
    const rate = limiter()
    rate.tripBreaker()

    for (const lane of ["html", "api"] as const) {
      const error = await rate.run(lane, 1, async () => "不该跑到这里").then(
        () => null,
        (err: unknown) => err,
      )
      expect(isEhFailure(error) && error.ehKind).toBe("banned")
    }

    // 图床和 e 站主站是两套基础设施，主站封 IP 不影响取图
    expect(await rate.run("image", 1, async () => "ok")).toBe("ok")
    expect(rate.breakerRemainingMs()).toBeGreaterThan(0)
  })

  test("没熔断时剩余时间是 0", () => {
    expect(limiter().breakerRemainingMs()).toBe(0)
  })

  test("任务抛错也会让出通道", async () => {
    const rate = limiter({ htmlMinIntervalMs: 0 })

    await expect(rate.run("html", 1, async () => Promise.reject(new Error("上游炸了")))).rejects.toThrow("上游炸了")
    // 前一个任务没释放位置的话这里会永远挂住
    expect(await rate.run("html", 1, async () => "后续请求照常")).toBe("后续请求照常")
  })
})
