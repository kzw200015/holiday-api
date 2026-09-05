import { clamp, useEventListener, useTimeoutFn } from "@vueuse/core"
import { computed, ref, watch } from "vue"
import { onBeforeRouteLeave, useRouter } from "vue-router"

import { fetchGalleryDetail } from "@/api/eh"
import { useGalleryNavigation } from "@/composables/galleryNavigation"
import { useQuery } from "@/composables/useQuery"
import { useReadingProgress } from "@/composables/useReadingProgress"
import { backOrReplace } from "@/lib/navigation"

const PAGE_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  PageDown: 1,
  " ": 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  PageUp: -1,
}

/**
 * 阅读状态以路由 props 为来源。离开路由后旧组件的 props 保持不变，
 * 不会像 useRoute 那样在卸载前变成详情页的参数，最后一页的上报因此不需要额外守卫。
 */
export function useReader(props: Readonly<{ gid: number; token: string; page: number }>) {
  const router = useRouter()
  const navigation = useGalleryNavigation()
  const { data: detail, error, loading } = useQuery(
    () => `${props.gid}/${props.token}`,
    (_identity, signal) => fetchGalleryDetail(props.gid, props.token, signal),
  )
  const gallery = computed(() => detail.value?.gallery)
  const totalPages = computed(() => gallery.value?.fileCount ?? 0)
  /* 页码来自 URL，详情到达后才能按实际页数约束，避免手改地址请求越界图片。 */
  const page = computed(() => totalPages.value ? clamp(props.page, 1, totalPages.value) : Math.max(1, props.page))
  const chromeVisible = ref(true)
  const imageUrlTemplate = computed(() => detail.value?.imageUrlTemplate ?? "")
  const { start: scheduleHide } = useTimeoutFn(() => (chromeVisible.value = false), 2500, { immediate: false })

  function showChrome() {
    chromeVisible.value = true
    scheduleHide()
  }

  function goTo(next: number) {
    if (!totalPages.value) {
      return
    }
    const clamped = clamp(next, 1, totalPages.value)
    if (clamped === props.page) return
    /* 用 replace 让浏览器后退直接离开阅读，而非逐页回退。 */
    void router.replace({ name: "reader", params: { gid: props.gid, token: props.token, page: clamped } })
  }

  function exit() {
    backOrReplace(router, { name: "gallery-detail", params: { gid: props.gid, token: props.token } })
  }

  /* 有效进度：详情到达且页数已知。进度上报与离开通知共用这一份判断。 */
  const position = computed(() => detail.value && totalPages.value
    ? { gid: props.gid, token: props.token, page: page.value }
    : null,
  )
  onBeforeRouteLeave(() => {
    if (position.value) void navigation.trigger(position.value)
  })
  useReadingProgress(position)

  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    /* 焦点位于操作按钮时，空格和回车应保留原生激活行为。 */
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, [contenteditable]")) {
      return
    }
    const step = PAGE_STEPS[event.key]
    if (step) {
      event.preventDefault()
      goTo(page.value + step)
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      goTo(event.key === "Home" ? 1 : totalPages.value)
    } else if (event.key === "Escape") {
      event.preventDefault()
      exit()
    }
  })

  /* 换页或详情到达时重新露出操作栏；URL 越界时由 goTo 把地址收敛到实际页数。 */
  watch([detail, page], () => {
    showChrome()
    if (detail.value) goTo(page.value)
  }, { immediate: true })

  return { gallery, error, loading, page, totalPages, imageUrlTemplate, chromeVisible, showChrome, goTo, exit }
}
