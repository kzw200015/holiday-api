import { QueryClient } from "@tanstack/vue-query"

/** 默认的新鲜期。过了这个时长再进页面才会重新请求。 */
const DEFAULT_STALE_TIME = 30 * 1000

/** 要抓上游页面才能拿到的内容（图集元数据、评论）新鲜期放长：慢，而且短时间内不会变。 */
export const CONTENT_STALE_TIME = 5 * 60 * 1000

/** 节假日安排一年都不会变，同一天问第二次没有意义。 */
export const HOLIDAY_STALE_TIME = 60 * 60 * 1000

/**
 * 全站共享的查询缓存。
 *
 * 「旧响应不算数」这条规则从此只由查询键承担：键变了就是另一份数据，上一份的响应不会写进来，
 * 也不必在页面里数版本号或比对 signal。数据活在缓存里而不是组件实例里，所以页面被销毁、
 * 被 KeepAlive 挤掉、或者干脆不缓存，都不影响下次进来能立刻看到内容。
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME,
        /* 不自动重试、也不在窗口重新聚焦时偷偷重取：这个站的失败都要让用户看见，并由他自己决定重试。 */
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}
