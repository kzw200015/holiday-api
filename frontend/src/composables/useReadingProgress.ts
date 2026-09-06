import { useTimeoutFn } from "@vueuse/core"
import { onScopeDispose, watch, type WatchSource } from "vue"

import { saveProgress } from "@/api/eh"

/** 快照固定账号图集与页码，延迟回调不再读取已经切换的路由。 */
interface ReadingProgress {
  gid: number
  token: string
  page: number
}

export function useReadingProgress(source: WatchSource<ReadingProgress | null>) {
  let pending: ReadingProgress | null = null
  const { start, stop } = useTimeoutFn(flush, 1200, { immediate: false })

  function flush() {
    stop()
    if (!pending) {
      return
    }
    const { gid, token, page } = pending
    pending = null
    /* 进度保存失败不阻断阅读，后续翻页会再次上报。 */
    void saveProgress(gid, token, page).catch(() => {})
  }

  watch(
    source,
    (progress) => {
      if (pending && (!progress || progress.gid !== pending.gid || progress.token !== pending.token)) {
        flush()
      }
      pending = progress
      if (progress) {
        start()
      }
    },
    { immediate: true },
  )

  /* 离开阅读页时补报最后一页，不能等防抖计时结束后再读取其他页面的参数。 */
  onScopeDispose(flush)
}
