import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed } from "vue"

import { fetchSearchHistory, saveSearchHistory } from "@/features/eh/api"
import { ehKeys } from "@/features/eh/keys"

/* 最多留几条。后端列上有同样的上限，超了会被退回来，所以这里就是那条规则本身。 */
const LIMIT = 10

/* 后端拒收超过这么多字节的关键词。整份提交里混进一条，之后每次保存都会跟着失败，所以超长的干脆不记。 */
const MAX_ENTRY_BYTES = 200

/**
 * 账号共享的搜索历史。
 *
 * 最近搜的排最前、同一个词只留一条、总共留 10 条——这三条本来就是界面的规则，所以由这里说了算；
 * 服务端只负责校验和存住。关键词进来之前已经去过两端空白，和服务端存下的那份一致。
 */
export function useSearchHistory() {
  const queryClient = useQueryClient()
  const loaded = useQuery({
    queryKey: ehKeys.searchHistory,
    queryFn: ({ signal }) => fetchSearchHistory(signal),
    staleTime: Infinity,
  })
  const entries = computed(() => loaded.data.value ?? [])

  const saving = useMutation({
    mutationFn: (next: string[]) => saveSearchHistory(next),
    /* 和偏好同一套：整份提交按顺序发，乱序会让旧快照顶掉新的。 */
    scope: { id: "eh-search-history" },
    onMutate: (next) => {
      queryClient.setQueryData(ehKeys.searchHistory, next)
    },
  })

  return {
    /* 和偏好一样，真的读到了才算就绪：读失败时按空的用，下一次搜索就会把服务端那份历史冲掉。 */
    ready: computed(() => loaded.data.value !== undefined),
    loadError: computed(() => loaded.error.value?.message ?? ""),
    reload: () => void loaded.refetch(),
    entries,
    record: (keyword: string) => {
      if (new TextEncoder().encode(keyword).length > MAX_ENTRY_BYTES) {
        return
      }
      saving.mutate([keyword, ...entries.value.filter((entry) => entry !== keyword)].slice(0, LIMIT))
    },
    remove: (keyword: string) => saving.mutate(entries.value.filter((entry) => entry !== keyword)),
    clear: () => saving.mutate([]),
  }
}
