import { computed, onScopeDispose, watch, type WatchSource } from "vue"

import { createRequest } from "@/shared/api/request"

/**
 * 跟着参数走的一路读取，数据只活在当前组件里。
 *
 * sources 列出这次读取依赖的参数，任何一项变了就丢掉旧数据、按新参数重读；fetcher 自己去取参数的当前值。
 * 组件销毁时取消在途的那次。页面被 KeepAlive 留着时数据也跟着留着，不必另外缓存。
 */
export function useRequest<T>(sources: WatchSource[], fetcher: (signal: AbortSignal) => Promise<T>) {
  const request = createRequest<T>()
  /* 返回的 Promise 不会 reject，失败落在 errorMessage 上；要等它读完的（如页面上的刷新按钮）可以 await。 */
  const reload = () => request.run(fetcher)

  watch(
    sources,
    () => {
      request.clear()
      void reload()
    },
    { immediate: true },
  )
  onScopeDispose(request.abort)

  return {
    data: request.data,
    /* 还没拿到数据、也还没失败。重试时错误先被清掉，所以重试期间同样算加载中。 */
    loading: computed(() => request.data.value === undefined && request.error.value === null),
    errorMessage: computed(() => request.error.value?.message ?? ""),
    reload,
  }
}
