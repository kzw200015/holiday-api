import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed } from "vue"

import { ehKeys } from "@/features/eh/keys"
import { useEhStore } from "@/features/eh/store"

/**
 * 账号共享的搜索历史。
 *
 * 四个接口都返回整份历史，提交方式只有「整份替换」这一种：两次提交的响应要是乱了序，后到的
 * 旧快照就会把新的顶掉。Store 那条串行队列保证请求按提交顺序发出、逐个完成，这里才能放心地
 * 拿响应直接覆盖缓存。页面上的进行中与失败提示由每个页面各自持有。
 */
export function useSearchHistory() {
  const store = useEhStore()
  const queryClient = useQueryClient()
  const loaded = useQuery({
    queryKey: ehKeys.searchHistory,
    queryFn: ({ signal }) => store.loadSearchHistory(signal),
    /* 别的设备搜过的词也该出现，回到页面就重新问一次。 */
    staleTime: 0,
  })

  function accept(entries: string[]) {
    queryClient.setQueryData(ehKeys.searchHistory, entries)
  }

  const recording = useMutation({ mutationFn: (keyword: string) => store.recordSearch(keyword), onSuccess: accept })
  const removing = useMutation({ mutationFn: (keyword: string) => store.removeSearch(keyword), onSuccess: accept })
  const clearing = useMutation({ mutationFn: () => store.clearSearchHistory(), onSuccess: accept })

  /* 页面上只有一处提示，显示的是最近一次写入的结果，所以发起新写入前先清掉上一次的失败。 */
  function beginWrite() {
    recording.reset()
    removing.reset()
    clearing.reset()
  }

  /* 写失败排在读失败前面：读取会随页面激活自动重来，写入不会。 */
  const errorMessage = computed(() => {
    if (recording.error.value) {
      return "搜索历史保存失败，本次关键词未确认保存。"
    }
    if (removing.error.value) {
      return "删除搜索历史失败，请重试。"
    }
    if (clearing.error.value) {
      return "清空搜索历史失败，请重试。"
    }
    return loaded.error.value ? "读取搜索历史失败。" : ""
  })

  return {
    entries: computed(() => loaded.data.value ?? []),
    loading: computed(
      () =>
        loaded.isFetching.value || recording.isPending.value || removing.isPending.value || clearing.isPending.value,
    ),
    errorMessage,
    load: async () => {
      await loaded.refetch()
    },
    /* 三个写入都不把失败往外抛：原因已经由 errorMessage 显示给用户，catch 只是免得它再变成一次
     * 未处理的拒绝。调用方大多用 void 发出去就不管了，接不住这个拒绝。 */
    record: (keyword: string) => {
      beginWrite()
      return recording.mutateAsync(keyword).catch(() => {})
    },
    remove: (keyword: string) => {
      beginWrite()
      return removing.mutateAsync(keyword).catch(() => {})
    },
    clear: () => {
      beginWrite()
      return clearing.mutateAsync().catch(() => {})
    },
  }
}
