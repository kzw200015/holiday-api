import { recordSearchKeyword, searchHistoryEntrySchema } from "@myapi/shared/eh"
import { computed } from "vue"

import { addSearchKeyword, clearSearchHistory, fetchSearchHistory, removeSearchKeyword } from "@/features/eh/api"
import { ehKeys, useEhWrites } from "@/features/eh/queries"
import { useOptimisticData } from "@/shared/api/optimistic"

/**
 * 账号共享的搜索历史。
 *
 * 一次记或删一个词（见 ADR-0006）：本地当场按共享包里的同一条规则改好，改动随后依次发出，存不上就重读一次。
 * 关键词进来之前已经去过两端空白，和服务端存下的那份一致。
 */
export function useSearchHistory() {
  const { query, change } = useOptimisticData(ehKeys.searchHistory, fetchSearchHistory, useEhWrites())

  return {
    ready: computed(() => query.data.value !== undefined),
    loadError: computed(() => query.error.value?.message ?? ""),
    reload: () => void query.refresh(),
    entries: computed(() => query.data.value ?? []),
    record: (keyword: string) => {
      /* 服务端会退回的词（超长）不记：记了本地也会被重读按回去。 */
      if (!searchHistoryEntrySchema.safeParse(keyword).success) {
        return
      }
      change({
        apply: (entries) => recordSearchKeyword(entries, keyword),
        send: () => addSearchKeyword(keyword),
      })
    },
    remove: (keyword: string) =>
      change({
        apply: (entries) => entries.filter((entry) => entry !== keyword),
        send: () => removeSearchKeyword(keyword),
      }),
    clear: () => change({ apply: () => [], send: clearSearchHistory }),
  }
}
