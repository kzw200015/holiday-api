import type { RouteLocationRaw, Router } from "vue-router"

/* 回到父页面：上一条历史就是目标才 back，否则 replace，避免浏览器后退又进入子页。 */
export function backOrReplace(router: Router, to: RouteLocationRaw) {
  const target = router.resolve(to).fullPath
  if (router.options.history.state.back === target) {
    router.back()
  } else {
    void router.replace(target)
  }
}
