import { nextTick, onActivated, watch, type WatchSource } from "vue"
import { onBeforeRouteLeave } from "vue-router"

/* 主动返回与浏览器后退都恢复组件自己的位置，不依赖浏览器的历史位置快照。 */
export function usePageScroll(identity?: WatchSource<unknown>) {
  let top = 0
  onBeforeRouteLeave(() => {
    top = window.scrollY
  })
  onActivated(async () => {
    await nextTick()
    window.scrollTo({ top, behavior: "instant" })
  })
  async function reset() {
    top = 0
    await nextTick()
    window.scrollTo({ top: 0, behavior: "instant" })
  }
  if (identity) {
    watch(identity, reset)
  }
  return reset
}
