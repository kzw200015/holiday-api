import { computed } from "vue"

import { useSearchHistoryStore } from "@/features/eh/store"

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
  const store = useSearchHistoryStore()
  void store.load()
  const entries = computed(() => store.data ?? [])

  /* 没读到就不改也不存：保存是整份提交，拿空列表改出来的那份会把服务端原有的历史冲掉。
   * 图库页面有布局层挡着到不了这里，这是给布局外的用法留的底。 */
  function change(next: (current: string[]) => string[]) {
    if (store.data) {
      store.set(next(store.data))
    }
  }

  return {
    /* 和偏好一样，真的读到了才算就绪。 */
    ready: computed(() => store.data !== undefined),
    loadError: computed(() => store.error?.message ?? ""),
    reload: () => void store.reload(),
    entries,
    record: (keyword: string) => {
      if (new TextEncoder().encode(keyword).length > MAX_ENTRY_BYTES) {
        return
      }
      change((current) => [keyword, ...current.filter((entry) => entry !== keyword)].slice(0, LIMIT))
    },
    remove: (keyword: string) => change((current) => current.filter((entry) => entry !== keyword)),
    clear: () => change(() => []),
  }
}
