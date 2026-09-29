<script setup lang="ts">
import { useEventListener, useFullscreen, useTimeoutFn } from "@vueuse/core"
import { onScopeDispose, ref, watch } from "vue"
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter, type RouteLocationNormalized } from "vue-router"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import ReaderControls from "@/features/eh/components/ReaderControls.vue"
import ReaderStrip from "@/features/eh/components/ReaderStrip.vue"
import { useGallery } from "@/features/eh/composables/useGallery"
import { useReaderSession } from "@/features/eh/composables/useReaderSession"
import { galleryDetailLocation, readerInstanceKey, readerLocation, type GallerySource } from "@/features/eh/navigation"
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
const { gallery, loaded, loading, errorMessage } = useGallery(
  () => props.gid,
  () => props.token,
)
/*
 * 这次阅读本身（页码、自动翻页、进度上报）在 useReaderSession 里，这里只把地址栏、键盘、点击接进去。
 *
 * 地址栏是页码的投影而不是真源：反过来的话翻一页要穿过一次路由导航才能生效，而滚动是每帧都在发生的事，
 * 拖动进度条会先跳回旧值再被纠正，滚动时还会连发好几次同样的 replace。地址栏只需要在停下来之后对得上，
 * 好让刷新和分享落在同一页，所以这里只把页码节流写回去。缓存里有详情时页数一开始就知道，手改地址留下的越界页码当场收回。
 */
const session = useReaderSession({
  gid: props.gid,
  token: props.token,
  page: props.page,
  pages: () => (loaded.value ? (gallery.value?.fileCount ?? 0) : undefined),
})
const controlsVisible = ref(true)
/* 全屏连浏览器的地址栏、标签栏也收起来，离开阅读器时退出。 */
const fullscreen = useFullscreen(undefined, { autoExit: true })

function toggleFullscreen() {
  /* 浏览器拒绝全屏时维持原样，不打扰。 */
  fullscreen.toggle().catch(() => {})
}

/* 用 replace 让浏览器后退直接离开阅读，而非逐页回退。 */
function syncUrl() {
  if (session.page !== props.page) {
    void router.replace(readerLocation(props, session.page, props.source))
  }
}

const { start: scheduleUrlSync, stop: cancelUrlSync } = useTimeoutFn(syncUrl, URL_SYNC_DELAY, { immediate: false })
/*
 * 正在进行的那次离开。离开要等目标页面的代码下载完才算走成，这期间惯性滚动之类仍会改页码，
 * 再排上的那次 replace 会把离开顶掉、把人拽回阅读器，所以离开途中不再写地址栏。
 */
let leavingTo: RouteLocationNormalized | undefined
/* immediate：开头就收回过的越界页码同样要写回地址栏。 */
watch(
  () => session.page,
  () => {
    if (!leavingTo) {
      scheduleUrlSync()
    }
  },
  { immediate: true },
)

function leave(to: RouteLocationNormalized) {
  leavingTo = to
  cancelUrlSync()
  session.leave()
}
onBeforeRouteLeave(leave)
/* 手改地址换图集不算离开路由，但 App.vue 马上要按同一个 key 重建这个实例，同样当作离开。 */
onBeforeRouteUpdate((to, from) => {
  if (readerInstanceKey(to) !== readerInstanceKey(from)) {
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
    if (next !== session.page) {
      session.page = next
    }
  },
)

/* 点阅读区左右各三分之一翻页，中间切换操作栏。阅读器铺满整个窗口，所以按窗口宽度分。还没有页面可翻时只切换操作栏。 */
function onTap(event: MouseEvent) {
  const third = window.innerWidth / 3
  if (!session.total || (event.clientX >= third && event.clientX <= third * 2)) {
    controlsVisible.value = !controlsVisible.value
  } else {
    session.page += event.clientX < third ? -1 : 1
  }
}

function exit() {
  /* 退出一律回详情页；从阅读历史来的，详情页那边的「返回列表」会继续把人送回历史。 */
  returnTo(galleryDetailLocation(props, props.source))
}

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
    session.page += step
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault()
    session.page = event.key === "Home" ? 1 : session.total
  } else if (event.key === "Escape") {
    event.preventDefault()
    exit()
  }
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-black" @click="onTap">
    <!-- 只有一份都没读到才挡住阅读；手上有旧详情时重取失败，照常读，不打断。 -->
    <div v-if="errorMessage" class="flex flex-1 items-center justify-center p-4">
      <div class="max-w-md">
        <ErrorAlert :message="errorMessage" title="打不开这个图集">
          <Button size="sm" variant="outline" @click="exit">返回</Button>
        </ErrorAlert>
      </div>
    </div>
    <div v-else-if="loaded && !session.total" class="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <p role="status" class="text-sm text-white/80">这个图集没有可以阅读的页面。</p>
      <Button size="sm" variant="outline" @click="exit">返回</Button>
    </div>
    <div v-else class="relative flex min-h-0 flex-1 overflow-hidden">
      <ReaderStrip v-if="session.total" :session="session" :gid="gid" :token="token" />
      <Skeleton v-if="loading" class="absolute inset-x-1/4 inset-y-8 rounded-lg" />
    </div>
    <ReaderControls
      :session="session"
      :title="gallery?.title"
      :visible="controlsVisible"
      :can-fullscreen="fullscreen.isSupported.value"
      :fullscreen="fullscreen.isFullscreen.value"
      @toggle-fullscreen="toggleFullscreen"
      @exit="exit"
    />
  </div>
</template>
