import { useRouter, type RouteLocationRaw } from "vue-router"

/**
 * 回到上一级页面。
 *
 * 浏览器历史的上一条正好就是那里时直接退回去，否则原地替换。一律 push 会在历史里再垫一层；
 * 一律 replace 则会留下两条一样的记录，按系统后退键时停在原地不动。
 * 比对的是完整地址（含查询串），来源参数不同的同一个页面不算同一处。
 */
export function useGoBack() {
  const router = useRouter()
  return (to: RouteLocationRaw) => {
    const target = router.resolve(to).fullPath
    if (router.options.history.state.back === target) {
      router.back()
    } else {
      void router.replace(target)
    }
  }
}
