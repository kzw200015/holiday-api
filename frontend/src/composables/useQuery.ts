import { ref, shallowRef, watch, type WatchSource } from "vue"

import { useAsyncAction } from "@/composables/useAsyncAction"

/**
 * 页面查询随参数变化重新加载；卸载或换参数后，旧响应不能再写入页面。
 *
 * 「旧响应不算数」这条规则不在这里实现，而是照搬 useAsyncAction 的那一份：换参数、重试、
 * 页面卸载，跟用户连点两次保存是同一回事——都是「又来了一次，上一次的结果作废」。两边各写
 * 一份的话规则会慢慢分叉（取消算不算失败、被顶掉的那次能不能关 loading），改一处忘一处。
 *
 * 这里只剩两件 useAsyncAction 管不着的事：什么时候该重取（参数变了或点了重试），
 * 以及结果存在哪（data，页面只读）。
 */
export function useQuery<Params, Data>(
  source: WatchSource<Params>,
  request: (params: Params, signal: AbortSignal) => Promise<Data>,
) {
  const data = shallowRef<Data | null>(null)
  const revision = ref(0)
  /* 参数一变就作废上一次，正是 latestOnly。 */
  const action = useAsyncAction({ latestOnly: true })

  watch(
    [source, revision],
    ([params]) => {
      data.value = null
      void action.run((signal) => request(params, signal), {
        apply: (result) => {
          data.value = result
        },
      })
    },
    { immediate: true },
  )

  /* 重试复用同一 watch 的取消与过期响应保护，不另起请求通道。 */
  const retry = () => {
    revision.value += 1
  }

  return { data, error: action.error, loading: action.pending, retry }
}
