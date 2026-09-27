import { useInfiniteScroll } from "@vueuse/core"
import { onActivated, onDeactivated, ref } from "vue"

/** 被 KeepAlive 留着的页面上的触底加载：页面收到后台时不再自动补页。 */
export function useInfiniteLoad(loadMore: () => void, canLoadMore: () => boolean) {
  const active = ref(true)
  onActivated(() => {
    active.value = true
  })
  onDeactivated(() => {
    active.value = false
  })
  useInfiniteScroll(() => (active.value ? window : null), loadMore, { distance: 600, canLoadMore })
}
