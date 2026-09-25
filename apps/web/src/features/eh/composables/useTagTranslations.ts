import { useMutation, useQuery, useQueryCache } from "@pinia/colada"
import { computed } from "vue"

import { fetchTagTranslationStatus, syncTagTranslations } from "@/features/eh/api"
import { ehKeys } from "@/features/eh/queries"

/**
 * 标签译名的同步状态与手动同步，只在设置页用。
 *
 * 同步成功后直接用接口回的新状态，不再读一次。被 KeepAlive 留着的搜索结果要等下次搜索才换成新译名
 * （图集详情每次进入都会重读）：为几个标签的说法把它们全作废重来不值得。
 */
export function useTagTranslations() {
  const queryCache = useQueryCache()
  const query = useQuery({ key: ehKeys.tagTranslations, query: ({ signal }) => fetchTagTranslationStatus(signal) })
  const sync = useMutation({
    onMutate: () => queryCache.cancelQueries({ key: ehKeys.tagTranslations, exact: true }),
    mutation: () => syncTagTranslations(),
    onSuccess: (next) => queryCache.setQueryData(ehKeys.tagTranslations, next),
  })

  return {
    status: query.data,
    loading: computed(() => query.data.value === undefined && query.error.value === null),
    loadError: computed(() => query.error.value?.message ?? ""),
    syncing: sync.isLoading,
    errorMessage: computed(() => sync.error.value?.message ?? ""),
    /* 不会 reject，失败落在 loadError 上 */
    reload: () => query.refresh(),
    sync: () => sync.mutateAsync().catch(() => {}),
  }
}
