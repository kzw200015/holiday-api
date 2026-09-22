<script setup lang="ts">
import { clamp, useEventListener, useTimeoutFn } from "@vueuse/core"
import { computed, onScopeDispose, ref, watch } from "vue"
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter, type RouteLocationNormalized } from "vue-router"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import ReaderControls from "@/features/eh/components/ReaderControls.vue"
import ReaderStrip from "@/features/eh/components/ReaderStrip.vue"
import { useGalleryDetail } from "@/features/eh/composables/useGalleryDetail"
import { useReaderPlayback } from "@/features/eh/composables/useReaderPlayback"
import { useReadingProgress } from "@/features/eh/composables/useReadingProgress"
import { galleryDetailLocation, readerLocation, type GallerySource } from "@/features/eh/navigation"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"
import { useGoBack } from "@/shared/composables/useGoBack"

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

/* 一个实例只读一本：换图集时 App.vue 按 key 整个重建，所以 gid 与 token 在这里当常量用。 */
const props = withDefaults(
  defineProps<{
    gid: number
    token: string
    page: number
    source?: GallerySource
  }>(),
  { source: "search" },
)
const router = useRouter()
const returnTo = useGoBack()
const { gallery, imageUrlTemplate, loaded, loading, errorMessage } = useGalleryDetail(
  () => props.gid,
  () => props.token,
)
const { report: reportProgress, flush: flushProgress } = useReadingProgress(props.gid, props.token)
const totalPages = computed(() => gallery.value?.fileCount ?? 0)

/* 详情到手前页数未知，只保证不小于 1，越界的部分等页数到了再收回来；到手之后按实际页数夹住，没有页面的就停在 1。 */
function withinPages(target: number) {
  return loaded.value ? clamp(target, 1, Math.max(1, totalPages.value)) : Math.max(1, target)
}

/**
 * 当前页码的真源在这里，地址栏是它的投影。
 *
 * 反过来（地址栏当真源）意味着翻一页要穿过一次路由导航才能生效，而滚动是每帧都在发生的事：
 * 拖动进度条会先跳回旧值再被纠正，滚动时还会连发好几次同样的 replace。地址栏只需要在
 * 停下来之后对得上，好让刷新和分享落在同一页，所以这里只把页码节流写回去。
 *
 * 缓存里有详情时页数一开始就知道，手改地址留下的越界页码当场收回，免得先被上报出去。
 */
const current = ref(withinPages(props.page))
const page = computed({ get: () => current.value, set: goTo })
const seeking = ref(false)
const dragging = ref(false)
const controlsVisible = ref(true)
const playback = useReaderPlayback(page, totalPages, () => seeking.value || dragging.value)

function goTo(next: number) {
  current.value = withinPages(next)
}

/* 用 replace 让浏览器后退直接离开阅读，而非逐页回退。 */
function syncUrl() {
  if (current.value !== props.page) {
    void router.replace(readerLocation(props, current.value, props.source))
  }
}

const { start: scheduleUrlSync, stop: cancelUrlSync } = useTimeoutFn(syncUrl, URL_SYNC_DELAY, { immediate: false })
/*
 * 正在进行的那次离开。离开要等目标页面的代码下载完才算走成，这期间惯性滚动之类仍会改页码，
 * 再排上的那次 replace 会把离开顶掉、把人拽回阅读器，所以离开途中不再写地址栏。
 */
let leavingTo: RouteLocationNormalized | undefined
watch(current, () => {
  if (!leavingTo) {
    scheduleUrlSync()
  }
})
/* 开头就收回过的越界页码同样要写回地址栏。 */
if (current.value !== props.page) {
  scheduleUrlSync()
}

/* 这个实例要走了：自动翻页停下，还没发出的那次进度补上，否则最后翻的几页就丢了。 */
function leave(to: RouteLocationNormalized) {
  leavingTo = to
  cancelUrlSync()
  playback.stop()
  flushProgress()
}
onBeforeRouteLeave(leave)
/* 手改地址换图集不算离开路由，但这个实例马上要按图集重建，同样当作离开。 */
onBeforeRouteUpdate((to) => {
  if (Number(to.params.gid) !== props.gid || String(to.params.token) !== props.token) {
    leave(to)
  }
})
/* 离开没走成（被守卫拦下、被新的导航顶掉）就接着同步地址栏；之后任何一次导航走成了，也说明那次离开已经作废。 */
onScopeDispose(
  router.afterEach((to, _from, failure) => {
    if (leavingTo && (failure ? to === leavingTo : to !== leavingTo)) {
      leavingTo = undefined
      scheduleUrlSync()
    }
  }),
)

/* 地址栏是外部输入的入口：浏览器前进后退、手改页码都从这里进来。 */
watch(
  () => props.page,
  (next) => {
    if (next !== current.value) {
      goTo(next)
    }
  },
)

/* 页数到手（或重取后变了）时把手改地址留下的越界页码收回来。 */
watch([loaded, totalPages], () => {
  if (loaded.value) {
    goTo(current.value)
  }
})

function exit() {
  /* 退出一律回详情页；从阅读历史来的，详情页那边的「返回列表」会继续把人送回历史。 */
  returnTo(galleryDetailLocation(props, props.source))
}

/* 详情到达且页数已知后才报告位置。 */
watch(
  [() => loaded.value && totalPages.value > 0, page],
  ([ready, at]) => {
    if (ready) {
      reportProgress(at)
    }
  },
  { immediate: true },
)

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  /* 带修饰键的留给浏览器：Alt+←、⌘+← 是后退。 */
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return
  }
  const target = event.target instanceof HTMLElement ? event.target : undefined
  /* 输入类控件自己处理按键，进度条上的方向键本来就是翻页。 */
  if (target?.closest("input, textarea, select, [contenteditable]")) {
    return
  }
  /* 焦点停在按钮上时只把空格和回车留给按钮激活；方向键照常翻页，否则点过一次「下一页」键盘就失灵了。 */
  if (target?.closest("button") && (event.key === " " || event.key === "Enter")) {
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
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-black" @click="controlsVisible = !controlsVisible">
    <!-- 只有一份都没读到才挡住阅读；手上有旧详情时重取失败，图片地址照样能用，不打断。 -->
    <div v-if="errorMessage" class="flex flex-1 items-center justify-center p-4">
      <div class="max-w-md">
        <ErrorAlert :message="errorMessage" title="打不开这个图集">
          <Button size="sm" variant="outline" @click="exit">返回</Button>
        </ErrorAlert>
      </div>
    </div>
    <div v-else-if="loaded && !totalPages" class="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <p role="status" class="text-sm text-white/80">这个图集没有可以阅读的页面。</p>
      <Button size="sm" variant="outline" @click="exit">返回</Button>
    </div>
    <div v-else class="relative flex min-h-0 flex-1 overflow-hidden">
      <ReaderStrip
        v-if="imageUrlTemplate && totalPages"
        v-model:page="page"
        v-model:dragging="dragging"
        :total="totalPages"
        :template="imageUrlTemplate"
        :seeking="seeking"
      />
      <Skeleton v-if="loading" class="absolute inset-x-1/4 inset-y-8 rounded-lg" />
    </div>
    <ReaderControls
      v-model:page="page"
      v-model:seeking="seeking"
      :title="gallery?.title"
      :visible="controlsVisible"
      :total="totalPages"
      :playback="playback.state"
      @toggle-auto-paging="playback.toggle"
      @set-interval="playback.changeInterval"
      @reload-interval="playback.reloadInterval"
      @exit="exit"
    />
  </div>
</template>
