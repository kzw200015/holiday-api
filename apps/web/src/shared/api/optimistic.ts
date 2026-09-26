import { useMutation, useQuery, useQueryCache, type EntryKey } from "@pinia/colada"

import type { Writes } from "@/shared/api/writes"

/** 一次改动：apply 当场改本地那份（规则与服务端相同），send 随后把改动发出去。 */
interface OptimisticChange<T> {
  apply: (current: T) => T
  send: () => Promise<unknown>
}

/**
 * 本地当场改好、改动随后依次提交的一份服务端数据（见 ADR-0006）。
 *
 * 读之前先等已经发出的写入落地，否则读回来的旧值会把刚改的按回去。改动时先取消在途的读取（它带回的是改之前的样子），
 * 再改本地那份，改动经 writes 排队发出；存不上就重读一次，以服务端为准。还没读到时没有那份可改，只提交，
 * 提交之后同样重读一次：在途那次读取带回的是改之前的样子。
 */
export function useOptimisticData<T>(key: EntryKey, fetch: (signal: AbortSignal) => Promise<T>, writes: Writes) {
  const queryCache = useQueryCache()
  const query = useQuery({
    key,
    query: async ({ signal }) => {
      await writes.settled()
      return fetch(signal)
    },
  })
  const change = useMutation({
    onMutate: ({ apply }: OptimisticChange<T>) => {
      const current = queryCache.getQueryData<T>(key)
      if (current !== undefined) {
        queryCache.cancelQueries({ key, exact: true })
        queryCache.setQueryData(key, apply(current))
      }
      return { loaded: current !== undefined }
    },
    mutation: ({ send }: OptimisticChange<T>) => writes.serial(send),
    onSettled: (_result, error, _change, { loaded }) => {
      if (error || !loaded) {
        void queryCache.invalidateQueries({ key, exact: true })
      }
    },
  })
  return { query, change: (next: OptimisticChange<T>) => change.mutate(next) }
}
