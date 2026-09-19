import { onScopeDispose, ref, shallowRef } from "vue"

export interface AsyncActionOptions {
  /** 失败提示；不填就用错误自身的 message。 */
  failureMessage?: string
  /** 新一次调用取消上一次在途请求。读取类操作用它；写入类别用，免得把已经发出去的保存掐掉。 */
  latestOnly?: boolean
}

/* 队列取消抛的是 AbortError，Axios 取消抛的是 CanceledError，两种都不算失败。 */
function isCancellation(error: unknown) {
  const name = (error as Error | undefined)?.name
  return name === "AbortError" || name === "CanceledError"
}

export interface AsyncRunOptions<R> {
  /** 结果提交回页面。只有这次调用仍然有效时才会执行。 */
  apply?: (result: R) => void
  /** 覆盖这一次的失败提示。 */
  failureMessage?: string
}

/**
 * 一次用户操作的执行状态：pending 供按钮禁用，失败时把错误本身放进 error、把给人看的一句话
 * 放进 errorMessage。两者都留着：多数页面只要那句话，少数（比如 useQuery 的使用者）要拿原始
 * 错误自己判断怎么显示。
 *
 * 每个 action 只管自己那一份状态。页面上想只留一处提示，就在页面里把几个 errorMessage
 * 合成一个 computed——「显示哪一条」是排版决定，这里没有依据去替页面做；共用一个 ref 的话，
 * 任何一次新操作开跑都会顺手擦掉别人刚写下的失败提示。
 *
 * 关键是「过期」这一条规则只写在这里：作用域已经结束、请求被取消、或者又发起了新的同类操作，
 * 这次的结果就不再写回页面。页面各写各的话，同一条规则会长出好几种写法
 *（有的比对 signal.aborted、有的数版本号、有的挂个 disposed 布尔），漏掉一处就是「离开页面后
 * 迟到的响应把刚清空的列表又填回去」这种很难复现的问题。
 */
export function useAsyncAction(options: AsyncActionOptions = {}) {
  const pending = ref(false)
  const error = shallowRef<Error | null>(null)
  const errorMessage = ref("")
  const inflight = new Set<AbortController>()
  let revision = 0
  let disposed = false

  /** 执行一次操作，返回结果是否真的提交了（失败或已过期都是 false）。 */
  async function run<R>(request: (signal: AbortSignal) => Promise<R>, runOptions: AsyncRunOptions<R> = {}) {
    if (options.latestOnly) {
      cancel()
    }
    const controller = new AbortController()
    inflight.add(controller)
    const current = ++revision
    /* 过期判定的唯一出处，下面三个分支共用。 */
    const stale = () => disposed || controller.signal.aborted || current !== revision

    pending.value = true
    error.value = null
    errorMessage.value = ""
    try {
      const result = await request(controller.signal)
      if (stale()) {
        return false
      }
      runOptions.apply?.(result)
      return true
    } catch (cause) {
      /* 取消是页面切换、账号切换的一部分，不是故障，不该在界面上留下一条报错。 */
      if (!stale() && !isCancellation(cause)) {
        /* HTTP 层已统一为 Error，页面只负责展示。 */
        error.value = cause as Error
        errorMessage.value = runOptions.failureMessage ?? options.failureMessage ?? (cause as Error).message
      }
      return false
    } finally {
      inflight.delete(controller)
      /* 已经有新的一次在跑时，别把它的 pending 提前关掉。 */
      if (!stale()) {
        pending.value = false
      }
    }
  }

  /** 取消在途请求。已经到达服务端的写入取消不了，只是不再等它的响应。 */
  function cancel() {
    for (const controller of inflight) {
      controller.abort()
    }
    inflight.clear()
    /* 被取消的那次不会再走到 finally 去关 pending（它已经算过期了），这里直接收尾。 */
    pending.value = false
  }

  function clearError() {
    error.value = null
    errorMessage.value = ""
  }

  onScopeDispose(() => {
    disposed = true
    cancel()
  })

  return { pending, error, errorMessage, run, cancel, clearError }
}
