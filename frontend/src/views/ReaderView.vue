<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query"
import { clamp, useEventListener, useTimeoutFn } from "@vueuse/core"
import { computed, ref, watch } from "vue"
import { onBeforeRouteLeave, useRouter } from "vue-router"

import { ehKeys } from "@/api/eh"
import { CONTENT_STALE_TIME } from "@/api/queryClient"
import ErrorAlert from "@/components/ErrorAlert.vue"
import ReaderControls from "@/components/gallery/ReaderControls.vue"
import ReaderStrip from "@/components/gallery/ReaderStrip.vue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useReaderPlayback } from "@/composables/useReaderPlayback"
import { readerExitLocation, readerLocation, type ReaderOrigin } from "@/lib/galleryNavigation"
import { backOrReplace } from "@/lib/navigation"
import { useEhStore } from "@/stores/EhStore"

/* 页码写回地址栏的节流时长。滚动是每帧都可能变的，地址栏不该跟着抖。 */
const URL_SYNC_DELAY = 300

const PAGE_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  PageDown: 1,
  " ": 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  PageUp: -1,
}

/* 路由 props 随页面实例保留，缓存页面和阅读器各自使用自己的图集身份。 */
const props = withDefaults(
  defineProps<{
    gid: number
    token: string
    page: number
    origin?: ReaderOrigin
  }>(),
  { origin: () => ({ kind: "detail", source: "search" }) },
)
const router = useRouter()
const ehStore = useEhStore()
const identity = computed(() => `${props.gid}/${props.token}`)
const {
  data: detail,
  error,
  isPending: loading,
} = useQuery({
  queryKey: computed(() => ehKeys.gallery(props.gid, props.token)),
  queryFn: ({ signal }) => ehStore.loadGalleryDetail(props.gid, props.token, signal),
  staleTime: CONTENT_STALE_TIME,
})
const gallery = computed(() => detail.value?.gallery)
const totalPages = computed(() => gallery.value?.fileCount ?? 0)
/**
 * 当前页码的真源在这里，地址栏是它的投影。
 *
 * 反过来（地址栏当真源）意味着翻一页要穿过一次路由导航才能生效，而滚动是每帧都在发生的事：
 * 拖动进度条会先跳回旧值再被纠正，滚动时还会连发好几次同样的 replace。地址栏只需要在
 * 停下来之后对得上，好让刷新和分享落在同一页，所以这里只把页码节流写回去。
 */
const current = ref(Math.max(1, props.page))
const page = computed({ get: () => current.value, set: goTo })
const imageUrlTemplate = computed(() => detail.value?.imageUrlTemplate ?? "")
const seeking = ref(false)
const dragging = ref(false)
const controlsVisible = ref(true)
const playback = useReaderPlayback(identity, page, totalPages, () => seeking.value || dragging.value)

/* 页数未知时先不夹取：详情还没到，上一本图集的页数不能拿来约束这一本。 */
function goTo(next: number) {
  current.value = totalPages.value ? clamp(next, 1, totalPages.value) : Math.max(1, next)
}

/* 用 replace 让浏览器后退直接离开阅读，而非逐页回退。 */
function syncUrl() {
  if (current.value !== props.page) {
    void router.replace(readerLocation(props, current.value, props.origin))
  }
}
const { start: scheduleUrlSync, stop: cancelUrlSync } = useTimeoutFn(syncUrl, URL_SYNC_DELAY, { immediate: false })
watch(current, scheduleUrlSync)
/* 已经离开阅读器时那次迟到的 replace 会把人拽回来，所以走之前先取消。 */
onBeforeRouteLeave(cancelUrlSync)

/* 地址栏是外部输入的入口：浏览器前进后退、手改地址、换图集都从这里进来。 */
watch(
  () => props.page,
  (next) => {
    if (next !== current.value) {
      goTo(next)
    }
  },
)

/* 页数到手后把手改地址留下的越界页码收回来。 */
watch(totalPages, (total) => {
  if (total) {
    goTo(current.value)
  }
})

function exit() {
  backOrReplace(router, readerExitLocation(props, props.origin))
}

/* 详情到达且页数已知后才报告位置，保存时机与请求顺序由 Store 负责。 */
watch(
  () => (detail.value && totalPages.value ? { gid: props.gid, token: props.token, page: page.value } : null),
  (position) => {
    if (position) {
      ehStore.scheduleProgress(position)
    }
  },
  { immediate: true },
)

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  /* 焦点位于操作按钮时，空格和回车应保留原生激活行为。 */
  if (
    event.target instanceof HTMLElement &&
    event.target.closest("button, input, textarea, select, [contenteditable]")
  ) {
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

watch(identity, () => {
  seeking.value = false
  dragging.value = false
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-black" @click="controlsVisible = !controlsVisible">
    <div v-if="error" class="flex flex-1 items-center justify-center p-4">
      <div class="max-w-md">
        <ErrorAlert :message="error.message" title="打不开这个图集">
          <Button size="sm" variant="outline" @click="exit">返回</Button>
        </ErrorAlert>
      </div>
    </div>
    <div v-else class="relative flex min-h-0 flex-1 overflow-hidden">
      <ReaderStrip
        v-if="imageUrlTemplate && totalPages"
        :key="identity"
        v-model:page="page"
        v-model:dragging="dragging"
        :total="totalPages"
        :template="imageUrlTemplate"
        :seeking="seeking"
      />
      <Skeleton v-if="loading" class="absolute inset-x-1/4 inset-y-8 rounded-lg" />
    </div>
    <ReaderControls
      :key="identity"
      v-model:page="page"
      v-model:seeking="seeking"
      :title="gallery?.title"
      :visible="controlsVisible"
      :total="totalPages"
      :playback="playback.state"
      @toggle-auto-paging="playback.toggle"
      @set-interval="playback.setInterval"
      @exit="exit"
    />
  </div>
</template>
