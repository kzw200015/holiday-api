import { PiniaColada, type QueryCache, type UseInfiniteQueryData, type UseQueryEntryFilter } from "@pinia/colada"
import type { App } from "vue"

/**
 * 服务端数据统一交给 Pinia Colada（见 ADR-0006）。要在 Pinia 之后安装。
 *
 * 数据一律当场就算过期（staleTime 为 0）：挂载、换参数、回到被 KeepAlive 留着的页面（由页面在 onActivated 里 refresh）
 * 都重读一次，在读时复用那次请求。不在窗口聚焦、网络重连时重读，也不自动重试：失败交给用户点重试。
 */
export function installQueries(app: App) {
  app.use(PiniaColada, {
    queryOptions: { staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false },
  })
}

/**
 * 换本站账号时丢掉全部数据：取消在途的读取，删掉所有条目，新页面从头读。
 *
 * 删之前先解开还挂着的组件：它们马上要随页面重建卸载，卸载时会给条目排一个回收定时器，而回收是按 key 删的，
 * 到点会把新账号同 key 的条目一并删掉。解开之后排下的定时器随 remove 清掉，卸载时也就不再排。
 */
export function forgetQueries(queryCache: QueryCache) {
  queryCache.cancelQueries()
  for (const entry of queryCache.getEntries()) {
    for (const dep of entry.deps) {
      queryCache.untrack(entry, dep)
    }
    queryCache.remove(entry)
  }
}

/**
 * 触底加载的列表只留第一页：接着重读时只读这一页，不把翻过的每一页都向上游重抓一遍。
 * 没有数据的条目不动。
 */
export function keepFirstPage(queryCache: QueryCache, filters: UseQueryEntryFilter) {
  for (const entry of queryCache.getEntries(filters)) {
    const data = entry.state.value.data as UseInfiniteQueryData<unknown, unknown> | undefined
    if (data && data.pages.length > 1) {
      queryCache.setQueryData(entry.key, { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) })
    }
  }
}
