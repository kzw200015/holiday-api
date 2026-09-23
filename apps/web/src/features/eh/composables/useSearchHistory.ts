import { SEARCH_HISTORY_LIMIT, searchHistoryEntrySchema } from "@myapi/shared"
import { computed } from "vue"

import { useSearchHistoryStore } from "@/features/eh/store"

/**
 * 账号共享的搜索历史。
 *
 * 最近搜的排最前、同一个词只留一条、总共留 10 条——这三条本来就是界面的规则，所以由这里说了算；
 * 服务端只负责校验和存住。关键词进来之前已经去过两端空白，和服务端存下的那份一致。
 */
export function useSearchHistory() {
  const store = useSearchHistoryStore()
  void store.load()
  const entries = computed(() => store.data ?? [])

  return {
    /* 和偏好一样，真的读到了才算就绪。 */
    ready: computed(() => store.data !== undefined),
    loadError: computed(() => store.error?.message ?? ""),
    reload: () => void store.reload(),
    entries,
    /* 记、删、清空在没读到时都不生效，见 store 的 update。 */
    record: (keyword: string) => {
      /* 服务端会退回的词（超长）整份提交里混进一条，之后每次保存都会跟着失败，所以干脆不记。 */
      if (!searchHistoryEntrySchema.safeParse(keyword).success) {
        return
      }
      /* 最多留几条是服务端也会校验的规则，超了会被整份退回，所以直接用同一个数。 */
      store.update((current) =>
        [keyword, ...current.filter((entry) => entry !== keyword)].slice(0, SEARCH_HISTORY_LIMIT),
      )
    },
    remove: (keyword: string) => store.update((current) => current.filter((entry) => entry !== keyword)),
    clear: () => store.update(() => []),
  }
}
