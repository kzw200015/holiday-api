import { recordSearchKeyword, searchHistoryEntrySchema } from "@myapi/shared/eh"
import { useMutation, useQuery, useQueryCache } from "@pinia/colada"
import { computed } from "vue"

import { addSearchKeyword, clearSearchHistory, fetchSearchHistory, removeSearchKeyword } from "@/features/eh/api"
import { ehKeys, useEhWrites } from "@/features/eh/queries"

interface Change {
  /** 当场改本地那份，规则与服务端相同 */
  apply: (entries: string[]) => string[]
  send: () => Promise<unknown>
}

/**
 * 账号共享的搜索历史。
 *
 * 一次记或删一个词（见 ADR-0006）：本地当场按共享包里的同一条规则改好，改动随后依次发出，存不上就重读一次。
 * 读之前先等已经发出的改动落地。关键词进来之前已经去过两端空白，和服务端存下的那份一致。
 */
export function useSearchHistory() {
  const queryCache = useQueryCache()
  const writes = useEhWrites()
  const query = useQuery({
    key: ehKeys.searchHistory,
    query: async ({ signal }) => {
      await writes.account.settled()
      return fetchSearchHistory(signal)
    },
  })
  const change = useMutation({
    onMutate: ({ apply }: Change) => {
      const current = queryCache.getQueryData<string[]>(ehKeys.searchHistory)
      if (current) {
        queryCache.cancelQueries({ key: ehKeys.searchHistory, exact: true })
        queryCache.setQueryData(ehKeys.searchHistory, apply(current))
      }
      return { loaded: current !== undefined }
    },
    mutation: ({ send }: Change) => writes.account.serial(send),
    /* 存不上以服务端为准；没读到时改的，在途那次读取带回的是改之前的列表，同样重读一次。 */
    onSettled: (_result, error, _change, { loaded }) => {
      if (error || !loaded) {
        void queryCache.invalidateQueries({ key: ehKeys.searchHistory, exact: true })
      }
    },
  })

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
      change.mutate({
        apply: (entries) => recordSearchKeyword(entries, keyword),
        send: () => addSearchKeyword(keyword),
      })
    },
    remove: (keyword: string) =>
      change.mutate({
        apply: (entries) => entries.filter((entry) => entry !== keyword),
        send: () => removeSearchKeyword(keyword),
      }),
    clear: () => change.mutate({ apply: () => [], send: clearSearchHistory }),
  }
}
