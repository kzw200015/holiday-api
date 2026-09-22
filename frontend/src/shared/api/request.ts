import { ref, shallowRef } from "vue"

/**
 * 一路读取的状态：数据、错误与是否在途。
 *
 * 同一时刻只认最后发起的那一次：再次 run、abort 或 clear 都会取消在途的那次，它迟到的结果什么也不写。
 * 「旧响应不算数」这条规则只在这里实现，页面和 store 不再自己比对 signal 或数版本号。
 */
export function createRequest<T>() {
  const data = shallowRef<T>()
  const error = shallowRef<Error | null>(null)
  const pending = ref(false)
  let controller: AbortController | undefined

  /** 发起一次读取。开始时清掉旧错误、保留旧数据；返回的 Promise 不会 reject，失败落在 error 上。 */
  async function run(fetcher: (signal: AbortSignal) => Promise<T>) {
    controller?.abort()
    const current = new AbortController()
    controller = current
    pending.value = true
    error.value = null
    try {
      const result = await fetcher(current.signal)
      if (controller === current) {
        data.value = result
      }
    } catch (cause) {
      if (controller === current) {
        error.value = cause as Error
      }
    } finally {
      if (controller === current) {
        controller = undefined
        pending.value = false
      }
    }
  }

  function abort() {
    controller?.abort()
    controller = undefined
    /* 被取消的那次已经不算数，不会再走到上面的 finally 去关 pending，这里直接收尾。 */
    pending.value = false
  }

  function clear() {
    abort()
    data.value = undefined
    error.value = null
  }

  return { data, error, pending, run, abort, clear }
}

/**
 * 把写入排成一队依次发出。
 *
 * 整份提交一旦乱序，后到的旧快照会把新的顶掉，所以前一次回来之前不发下一次。某一次失败只是它没存上，不挡后面的。
 * reset 之后，还在排队的那些不再发出：换账号时旧账号的提交不该带着新令牌出去。已经发出的那次管不了，也不必管。
 */
export function createQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  let generation = 0

  function enqueue(task: () => Promise<unknown>) {
    const queuedIn = generation
    tail = tail
      .then(() => (queuedIn === generation ? task() : undefined))
      .catch(() => {
        /* 存不上不提示也不重试，下一次改动会把最新的整份再推一遍。 */
      })
  }

  function reset() {
    generation += 1
  }

  /** 等到此刻已经排上的写入全部跑完，成败都算。之后再排上的不等。 */
  function idle(): Promise<void> {
    return tail.then(() => undefined)
  }

  return { enqueue, reset, idle }
}
