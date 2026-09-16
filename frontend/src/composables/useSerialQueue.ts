import { onScopeDispose } from "vue"

/** 串行执行请求并同步提交结果；单次失败不阻塞后续任务。 */
export function useSerialQueue() {
  let controller = new AbortController()
  let tail = Promise.resolve()

  function run<T>(request: (signal: AbortSignal) => Promise<T>, apply: (result: T) => void, signal?: AbortSignal) {
    const requestSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
    const operation = tail.then(async () => {
      requestSignal.throwIfAborted()
      const result = await request(requestSignal)
      /* 请求实现可能忽略取消；提交前再检查，防止旧结果写入重置后的状态。 */
      requestSignal.throwIfAborted()
      apply(result)
      return result
    })
    tail = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  /* 取消旧队列并建立独立的新队列，新任务不等待旧请求退出。
   * AbortSignal 只能通知客户端取消，不能保证服务端撤销已经执行的写入。
   */
  function reset() {
    controller.abort()
    controller = new AbortController()
    tail = Promise.resolve()
  }

  onScopeDispose(reset)
  return { run, reset }
}
