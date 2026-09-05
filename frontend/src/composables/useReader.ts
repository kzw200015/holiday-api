import { useEventListener, useTimeoutFn } from "@vueuse/core"
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

import { fetchGalleryDetail, galleryImageUrl } from "@/api/eh"
import { useQuery } from "@/composables/useQuery"
import { useReadingProgress } from "@/composables/useReadingProgress"

/* 预取会消耗上游请求限额与用户图片额度，仅提前两页。 */
const PRELOAD_AHEAD = 2
const PAGE_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  PageDown: 1,
  " ": 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  PageUp: -1,
}

/** 阅读状态以图集参数和 URL 页码为来源，组件只渲染图片与操作栏。 */
export function useReader(props: Readonly<{ gid: number; token: string }>) {
  const route = useRoute()
  const router = useRouter()
  const { data: detail, error, loading } = useQuery(
    () => `${props.gid}/${props.token}`,
    (_identity, signal) => fetchGalleryDetail(props.gid, props.token, signal),
  )
  const gallery = computed(() => detail.value?.gallery)
  const totalPages = computed(() => gallery.value?.fileCount ?? 0)
  const requestedPage = computed(() => Math.max(1, Number(route.params.page ?? 1)))
  /* 页码来自 URL，详情到达后才能按实际页数约束，避免手改地址请求越界图片。 */
  const page = computed(() => totalPages.value ? Math.min(requestedPage.value, totalPages.value) : requestedPage.value)
  const imageFailed = ref(false)
  const retryNonce = ref(0)
  const chromeVisible = ref(true)
  const currentSrc = computed(() => detail.value && totalPages.value
    ? galleryImageUrl(detail.value.imageUrlTemplate, page.value, { nonce: retryNonce.value })
    : "",
  )
  const { start: scheduleHide } = useTimeoutFn(() => (chromeVisible.value = false), 2500, { immediate: false })

  function showChrome() {
    chromeVisible.value = true
    scheduleHide()
  }

  function goTo(next: number) {
    if (!totalPages.value) {
      return
    }
    const clamped = Math.min(Math.max(1, next), totalPages.value)
    /* 用 replace 让浏览器后退直接离开阅读，而非逐页回退。 */
    void router.replace({ name: "reader", params: { gid: props.gid, token: props.token, page: clamped } })
  }

  function exit() {
    void router.push({ name: "gallery-detail", params: { gid: props.gid, token: props.token } })
  }

  function retryImage(event: MouseEvent) {
    event.stopPropagation()
    imageFailed.value = false
    retryNonce.value += 1
  }

  function onClick(event: MouseEvent) {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const position = (event.clientX - bounds.left) / bounds.width
    if (position < 1 / 3) {
      goTo(page.value - 1)
    } else if (position > 2 / 3) {
      goTo(page.value + 1)
    } else {
      showChrome()
    }
  }

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

  const preloaded = new Set<number>()
  watch(detail, () => preloaded.clear())
  watch([detail, page], () => {
    imageFailed.value = false
    retryNonce.value = 0
    showChrome()
    if (!detail.value) {
      return
    }
    if (Number(route.params.page ?? 1) !== page.value) {
      goTo(page.value)
    }
    /* 与正式图片保持同一签名地址，浏览器才能复用预取缓存。换图集时清空记录。 */
    for (let target = page.value + 1; target <= Math.min(page.value + PRELOAD_AHEAD, totalPages.value); target += 1) {
      if (!preloaded.has(target)) {
        preloaded.add(target)
        new Image().src = galleryImageUrl(detail.value.imageUrlTemplate, target)
      }
    }
  }, { immediate: true })

  useReadingProgress(() => detail.value && totalPages.value
    ? { gid: props.gid, token: props.token, page: page.value }
    : null,
  )

  return { gallery, error, loading, page, totalPages, imageFailed, chromeVisible, currentSrc, goTo, exit, retryImage, onClick }
}
