import { ehFailure } from "./ehFailure"

/**
 * 出网限速。整个进程共用一份，因为所有用户共用同一个出口 IP，被 e 站盯上的是这个 IP 而不是某个人。
 *
 * 分三条互不相干的通道，是因为三类上游的容忍度差着两个数量级：
 * - html：e 站的页面，官方明说禁止自动化抓取，串行 + 秒级间隔 + 抖动，尽量不呈现机器般的节奏。
 * - api：api.e-hentai.org，官方口径是「连续 4-5 个请求后要等约 5 秒」，用令牌桶精确对齐。
 * - image：H@H 图床和 ehgt.org，本来就是给浏览器并发拉的，只限并发不限间隔。
 *
 * 三条混成一个全局队列的话，一屏 20 张缩略图会排成 20 秒，阅读体验直接没了。
 */
export type RateLane = "html" | "api" | "image"

/** 队列里等待放行的一个任务。 */
interface Waiter {
  userId: number
  start: () => void
}

interface LaneState {
  concurrency: number
  running: number
  waiting: Waiter[]
  /** 每个用户在这条通道上正在跑的任务数，用来做排队时的公平调度。 */
  inFlight: Map<number, number>
  /** 下一次允许启动的时间戳，html 通道用。 */
  nextStartAt: number
  /** 令牌桶，api 通道用。 */
  tokens: number
  refillAt: number
  /** 已经排好的唤醒定时器，避免同一条通道排出一堆。 */
  timer: ReturnType<typeof setTimeout> | null
}

export type EhRateLimiter = ReturnType<typeof createEhRateLimiter>

export function createEhRateLimiter({
  htmlMinIntervalMs,
  htmlJitterMs,
  apiBurst,
  apiWindowMs,
  imageConcurrency,
  banCooldownMs,
  maxQueueLength = 100,
}: {
  htmlMinIntervalMs: number
  htmlJitterMs: number
  apiBurst: number
  apiWindowMs: number
  imageConcurrency: number
  banCooldownMs: number
  maxQueueLength?: number
}) {
  const lanes: Record<RateLane, LaneState> = {
    html: newLane(1),
    api: newLane(1),
    image: newLane(imageConcurrency),
  }

  /** 熔断到什么时候。0 表示没熔断。 */
  let bannedUntil = 0

  return {
    /**
     * 在指定通道上排队执行一个任务。
     *
     * userId 只用于排队时的公平调度：轮到谁的时候优先挑当前跑得最少的那个用户，
     * 这样一个人翻大图集不会把队列占满。刻意不做「同一用户只准一个在途」那种硬拒绝——
     * 阅读时前后预取本来就会同时发好几个请求，硬拒会把正常用法也打掉。
     */
    async run<T>(lane: RateLane, userId: number, task: () => Promise<T>): Promise<T> {
      // 图片走的是 H@H 图床，和 e 站主站是两套基础设施，主站封 IP 不影响取图
      if (lane !== "image" && bannedUntil > Date.now()) {
        // 说清楚还要等多久，比笼统的「过几分钟」有用：用户才知道是刷新一下还是等会儿再来
        const minutes = Math.ceil(breakerRemainingMs() / 60_000)
        throw ehFailure("banned", `本机访问 e 站的频率过高已被临时限制，约 ${minutes} 分钟后恢复`)
      }

      const state = lanes[lane]
      if (state.waiting.length >= maxQueueLength) {
        throw ehFailure("busy", "排队的请求太多了，请稍后再试")
      }

      state.inFlight.set(userId, (state.inFlight.get(userId) ?? 0) + 1)
      try {
        await acquire(state, userId)
        try {
          return await task()
        } finally {
          state.running -= 1
          pump(state)
        }
      } finally {
        const remaining = (state.inFlight.get(userId) ?? 1) - 1
        if (remaining > 0) {
          state.inFlight.set(userId, remaining)
        } else {
          state.inFlight.delete(userId)
        }
      }
    },

    /**
     * 识别出 IP 被封或配额耗尽后调用，让 html / api 通道整体停手一段时间。
     * 没有这一步的话，被封之后还会继续按原节奏敲门，把临时封禁续成长期封禁。
     */
    tripBreaker(): void {
      bannedUntil = Date.now() + banCooldownMs
    },

    breakerRemainingMs,
  }

  /** 熔断剩余时间（毫秒），没熔断时为 0。写成局部函数，免得被解构调用时 this 丢掉。 */
  function breakerRemainingMs(): number {
    return Math.max(0, bannedUntil - Date.now())
  }

  function newLane(concurrency: number): LaneState {
    return {
      concurrency,
      running: 0,
      waiting: [],
      inFlight: new Map(),
      nextStartAt: 0,
      tokens: apiBurst,
      refillAt: 0,
      timer: null,
    }
  }

  function acquire(state: LaneState, userId: number): Promise<void> {
    return new Promise((resolve) => {
      state.waiting.push({ userId, start: resolve })
      pump(state)
    })
  }

  /** 尽可能多地放行队列里的任务，放不动了就按需要的等待时长排一个定时器。 */
  function pump(state: LaneState): void {
    while (state.running < state.concurrency && state.waiting.length > 0) {
      const delay = gateDelay(state)
      if (delay > 0) {
        scheduleWakeup(state, delay)
        return
      }

      const waiter = takeNext(state)
      if (!waiter) {
        return
      }
      state.running += 1
      consumeGate(state)
      waiter.start()
    }
  }

  function scheduleWakeup(state: LaneState, delay: number): void {
    if (state.timer !== null) {
      return
    }
    state.timer = setTimeout(() => {
      state.timer = null
      pump(state)
    }, delay)
    // 定时器不该拖住进程退出
    state.timer.unref?.()
  }

  /** 挑下一个放行的人：当前跑得最少的用户优先，同样少就按先来后到。 */
  function takeNext(state: LaneState): Waiter | undefined {
    let bestIndex = 0
    let bestLoad = Number.POSITIVE_INFINITY
    for (const [index, waiter] of state.waiting.entries()) {
      const load = state.inFlight.get(waiter.userId) ?? 0
      if (load < bestLoad) {
        bestLoad = load
        bestIndex = index
      }
    }
    return state.waiting.splice(bestIndex, 1)[0]
  }

  /** 还要等多久才能放行下一个。0 表示现在就能走。 */
  function gateDelay(state: LaneState): number {
    const now = Date.now()
    if (state === lanes.html) {
      return Math.max(0, state.nextStartAt - now)
    }
    if (state === lanes.api) {
      if (now >= state.refillAt) {
        state.tokens = apiBurst
        state.refillAt = now + apiWindowMs
      }
      return state.tokens > 0 ? 0 : state.refillAt - now
    }
    return 0
  }

  function consumeGate(state: LaneState): void {
    if (state === lanes.html) {
      // 间隔上加一点随机，免得请求节奏规律得像台机器
      state.nextStartAt = Date.now() + htmlMinIntervalMs + Math.random() * htmlJitterMs
      return
    }
    if (state === lanes.api) {
      state.tokens -= 1
    }
  }
}
