import { clamp } from "@vueuse/core"
import { computed, reactive, ref, toValue, watch, type MaybeRefOrGetter } from "vue"

import { useReaderPlayback } from "@/features/eh/composables/useReaderPlayback"
import { useReadingProgress } from "@/features/eh/composables/useReadingProgress"

interface ReaderSessionOptions {
  gid: number
  token: string
  /** 打开时的页码，通常来自地址栏，可能越界。 */
  page: number
  /** 这本有几页；详情到手之前是 undefined。 */
  pages: MaybeRefOrGetter<number | undefined>
}

/**
 * 一次阅读：从打开阅读器到离开，这本图集读到第几页、自动翻页，以及往服务端报读到哪了。
 *
 * 当前页码的真源在这里，地址栏、进度条、图片条的滚动位置都是它的投影，谁改都经 `page`。页数到手之前只保证不小于 1，
 * 到手之后按实际页数夹住（没有页面的停在 1），开头手改地址留下的越界页码这时收回，免得先被上报出去。
 * 进度条按住（seeking）或拖着图片（dragging）时自动翻页暂停，松开后等满一个间隔再翻。
 *
 * 路由、键盘、点击这些输入由阅读器页面接进来，这里不认识它们；页面离开时调 `leave()`。
 * 返回的是一个 reactive 对象，图片条与操作栏直接读写其中各自用到的那几项。
 */
export function useReaderSession({ gid, token, page: initialPage, pages }: ReaderSessionOptions) {
  const known = computed(() => toValue(pages))
  const total = computed(() => known.value ?? 0)
  const current = ref(withinPages(initialPage))
  /* 读的时候也夹一次：页数到手的那一刻，谁先读到都不会是越界的页码，不必看几个 watch 谁先跑。 */
  const page = computed({
    get: () => withinPages(current.value),
    set: (next: number) => (current.value = withinPages(next)),
  })
  const seeking = ref(false)
  const dragging = ref(false)
  const playback = useReaderPlayback(page, total, () => seeking.value || dragging.value)
  const progress = useReadingProgress(gid, token)

  function withinPages(target: number) {
    return known.value === undefined ? Math.max(1, target) : clamp(target, 1, Math.max(1, known.value))
  }

  /* 页数到手（或重取后变了）时把记着的越界页码也收回来，之后页数再变，它不会又冒出来。 */
  watch(known, () => {
    current.value = withinPages(current.value)
  })

  /* 页数到手且有页面可读后才报告位置。 */
  watch(
    [() => total.value > 0, page],
    ([ready, at]) => {
      if (ready) {
        progress.report(at)
      }
    },
    { immediate: true },
  )

  /** 这次阅读要结束了：自动翻页停下，还没发出的那次进度补上，否则最后翻的几页就丢了。 */
  function leave() {
    playback.stop()
    progress.flush()
  }

  return reactive({
    page,
    total,
    seeking,
    dragging,
    playback: playback.state,
    toggleAutoPaging: playback.toggle,
    changeInterval: playback.changeInterval,
    reloadInterval: playback.reloadInterval,
    leave,
  })
}

export type ReaderSession = ReturnType<typeof useReaderSession>
