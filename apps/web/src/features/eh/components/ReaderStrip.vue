<script setup lang="ts">
import { clamp, useResizeObserver, useTimeoutFn } from "@vueuse/core"
import { computed, nextTick, onMounted, onScopeDispose, ref, shallowRef, watch } from "vue"

import ReaderPage from "@/features/eh/components/ReaderPage.vue"
import type { ReaderSession } from "@/features/eh/composables/useReaderSession"
import { createReaderLayout } from "@/features/eh/readerLayout"

const LOAD_DELAY = 200
/* 顺着往后读的多，往后多备几页、往前只留一页：翻到下一页时它多半已经到了。 */
const PRELOAD_AHEAD = 4
const PRELOAD_BEHIND = 1
/* 离开视口这么多页之后把图片卸载：几百页的图集读到后面，不必把前面每一张大图都留在内存里。
 * ratios 不跟着清，页宽因此保持原样，卸载不会让布局跳动，滑回去时也还在原来的位置。 */
const KEEP_PAGES = 12

/*
 * 父级在页数已知且非零时挂载；换图集时整个阅读器重建，这里不会中途换一本。
 * 页码与拖动状态直接读写这次阅读（见 useReaderSession）：滚到哪页就改它的页码，拖着图片时它的自动翻页暂停。
 */
const props = defineProps<{
  gid: number
  token: string
  session: Pick<ReaderSession, "page" | "total" | "seeking" | "dragging">
}>()
const viewport = shallowRef<HTMLElement>()
const height = ref(1)
const width = ref(1)
const ratios = ref<Record<number, number>>({})
/* 进了加载窗口的页：挂着 ReaderPage 在签地址、取图，或者已经取到了。 */
const inWindow = ref<Set<number>>(new Set())
/* 停下时视口里的页优先取，预加载的往后排，免得眼前这页和后面几页抢带宽。 */
const visibleRange = ref({ first: 1, last: 0 })
let pointer: { id: number; x: number; y: number; left: number } | undefined
let dragged = false
let scrollTarget: number | undefined
let pendingAnchor: { page: number; relative: number } | undefined
const layout = computed(() => createReaderLayout(props.session.total, width.value, height.value, ratios.value))

function loadVisible() {
  if (!viewport.value) {
    return
  }
  const { first, last } = layout.value.visiblePages(viewport.value.scrollLeft)
  visibleRange.value = { first, last }
  const kept = new Set<number>()
  for (const pageNumber of inWindow.value) {
    if (pageNumber >= first - KEEP_PAGES && pageNumber <= last + KEEP_PAGES) {
      kept.add(pageNumber)
    }
  }
  /* 补充可见页，以及往后几页、往前一页。 */
  for (
    let pageNumber = Math.max(1, first - PRELOAD_BEHIND);
    pageNumber <= Math.min(props.session.total, last + PRELOAD_AHEAD);
    pageNumber++
  ) {
    kept.add(pageNumber)
  }
  inWindow.value = kept
}

const { start, stop: cancelLoad } = useTimeoutFn(loadVisible, LOAD_DELAY, { immediate: false })

function scheduleLoad() {
  cancelLoad()
  if (props.session.dragging || props.session.seeking || scrollTarget !== undefined || !viewport.value) {
    return
  }
  start()
}

async function jump(targetPage: number, behavior: ScrollBehavior = "instant") {
  cancelLoad()
  await nextTick()
  if (!viewport.value) {
    return
  }
  const target = layout.value.scrollToPage(targetPage)
  scrollTarget = behavior === "smooth" && Math.abs(viewport.value.scrollLeft - target) > 1 ? target : undefined
  viewport.value.scrollTo({ left: target, behavior })
  scheduleLoad()
}

/* 平滑滚动途中保留目标页码，避免中间页回流触发反向跳转。 */
function onScroll() {
  if (!viewport.value) {
    return
  }
  if (scrollTarget !== undefined) {
    scheduleLoad()
    if (Math.abs(viewport.value.scrollLeft - scrollTarget) > 1) {
      return
    }
    scrollTarget = undefined
  }
  const nextPage = layout.value.pageAtScroll(viewport.value.scrollLeft)
  if (nextPage !== props.session.page) {
    props.session.page = nextPage
  }
  scheduleLoad()
}

function interruptScroll() {
  if (scrollTarget !== undefined && viewport.value) {
    scrollTarget = undefined
    viewport.value.scrollTo({ left: viewport.value.scrollLeft, behavior: "instant" })
    onScroll()
  }
}

function onPointerDown(event: PointerEvent) {
  dragged = false
  if (event.button !== 0 || (event.target instanceof HTMLElement && event.target.closest("button"))) {
    return
  }
  interruptScroll()
  props.session.dragging = true
  /* 触屏保留浏览器原生惯性滚动，鼠标才需要自行搬动 scrollLeft。 */
  if (event.pointerType === "mouse" && viewport.value) {
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.value.scrollLeft }
    viewport.value.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
}

function onPointerMove(event: PointerEvent) {
  if (pointer?.id === event.pointerId && viewport.value) {
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) {
      dragged = true
    }
    viewport.value.scrollLeft = pointer.left + pointer.x - event.clientX
  }
}

function onClick(event: MouseEvent) {
  /* 鼠标拖动结束后浏览器仍可能派发 click，不能把它当作切换操作栏的单击。 */
  if (dragged) {
    event.stopPropagation()
  }
}

function onPointerEnd() {
  pointer = undefined
  props.session.dragging = false
}

function onWheel(event: WheelEvent) {
  interruptScroll()
  if (!viewport.value || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
    return
  }
  event.preventDefault()
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width.value : 1
  viewport.value.scrollLeft += event.deltaY * scale
}

async function onImageRatio(pageNumber: number, ratio: number) {
  if (!viewport.value) {
    return
  }
  /* 占位宽度换成真实比例时，维持当前页在视口中的相对位置；同一批到达的图片只锚定一次。 */
  pendingAnchor ??= {
    page: props.session.page,
    relative: viewport.value.scrollLeft - layout.value.offsetOf(props.session.page),
  }
  ratios.value[pageNumber] = ratio
  await nextTick()
  if (!viewport.value || !pendingAnchor) {
    return
  }
  const { page: anchor, relative } = pendingAnchor
  pendingAnchor = undefined
  if (scrollTarget !== undefined) {
    await jump(props.session.page, "smooth")
    return
  }
  viewport.value.scrollLeft = clamp(layout.value.offsetOf(anchor) + relative, 0, layout.value.maxScroll)
  scheduleLoad()
}

useResizeObserver(viewport, ([entry]) => {
  if (!entry) {
    return
  }
  height.value = Math.max(1, entry.contentRect.height)
  width.value = Math.max(1, entry.contentRect.width)
  void jump(props.session.page)
})
/* 挂上视口后先跳到当前页 */
onMounted(() => void jump(props.session.page))
/* 自己滚出来的页码回流时位置已经对上，只有外部跳页才需要搬动视口。 */
watch(
  () => props.session.page,
  (nextPage) => {
    if (
      viewport.value &&
      (scrollTarget !== undefined || nextPage !== layout.value.pageAtScroll(viewport.value.scrollLeft))
    ) {
      void jump(nextPage, props.session.seeking ? "instant" : "smooth")
    }
  },
)
watch([() => props.session.seeking, () => props.session.dragging], scheduleLoad)
/* 作用域结束后丢掉视口引用，等待中的跳转与图片回调据此放弃后续动作。 */
onScopeDispose(() => {
  viewport.value = undefined
})
</script>

<template>
  <div
    ref="viewport"
    aria-label="横向阅读区域"
    class="no-scrollbar flex min-h-0 min-w-0 flex-1 touch-pan-x select-none overflow-x-auto overflow-y-hidden overscroll-x-contain"
    :class="session.dragging ? 'cursor-grabbing' : 'cursor-grab'"
    style="overflow-anchor: none"
    @scroll="onScroll"
    @click="onClick"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @lostpointercapture="onPointerEnd"
  >
    <div
      v-for="pageNumber in session.total"
      :key="pageNumber"
      class="relative h-full shrink-0"
      :style="{ width: `${layout.widthOf(pageNumber)}px` }"
    >
      <ReaderPage
        v-if="inWindow.has(pageNumber)"
        :gid="gid"
        :token="token"
        :page="pageNumber"
        :eager="pageNumber >= visibleRange.first && pageNumber <= visibleRange.last"
        @ratio="onImageRatio(pageNumber, $event)"
      />
      <div v-else class="absolute inset-0 flex items-center justify-center text-sm text-white/40">
        第 {{ pageNumber }} 页
      </div>
    </div>
  </div>
</template>
