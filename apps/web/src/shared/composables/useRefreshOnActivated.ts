import { onActivated } from "vue"

/**
 * 被 KeepAlive 留着的页面每次回来都重读一次：它不会重新挂载，查询库也就不会自己重读（见 ADR-0006）。
 * 传进来的是各组合式函数的 reload（底层是查询的 refresh()）：首次挂载也会触发这里，那时已经在读，
 * refresh 复用那次请求，不必另外防重。
 */
export function useRefreshOnActivated(...refreshers: (() => unknown)[]) {
  onActivated(() => {
    for (const refresh of refreshers) {
      void refresh()
    }
  })
}
