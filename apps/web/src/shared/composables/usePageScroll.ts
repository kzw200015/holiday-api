import { nextTick, onActivated, onDeactivated, watch, type WatchSource } from "vue"
import { onBeforeRouteLeave } from "vue-router"

/* 主动返回与浏览器后退都恢复组件自己的位置，不依赖浏览器的历史位置快照。 */
export function usePageScroll(identity?: WatchSource<unknown>) {
  let top = 0
  /* 被 KeepAlive 停用时窗口里是别的页面 */
  let active = true
  onBeforeRouteLeave(() => {
    top = window.scrollY
  })
  onActivated(async () => {
    active = true
    await nextTick()
    window.scrollTo({ top, behavior: "instant" })
  })
  onDeactivated(() => {
    active = false
  })

  /** 回到顶部。停用时只记下，等回来再滚：这时滚的是别的页面。 */
  async function reset() {
    top = 0
    if (!active) {
      return
    }
    await nextTick()
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  if (identity) {
    watch(identity, reset)
  }
  return reset
}
