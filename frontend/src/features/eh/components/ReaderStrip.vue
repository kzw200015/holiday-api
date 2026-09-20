<script setup lang="ts">
import { clamp, useResizeObserver, useTimeoutFn } from "@vueuse/core"
import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from "vue"

import { Button } from "@/components/ui/button"
import { galleryImageUrl } from "@/features/eh/api"
import { createReaderLayout } from "@/features/eh/readerLayout"

const LOAD_DELAY = 200
const PRELOAD_PAGES = 2
/* 离开视口这么多页之后把图片卸载：几百页的图集读到后面，不必把前面每一张大图都留在内存里。
 * ratios 不跟着清，页宽因此保持原样，卸载不会让布局跳动，滑回去时也还在原来的位置。 */
const KEEP_PAGES = 12

/* 父级在页数已知且非零时挂载；换图集时整个阅读器重建，这里不会中途换一本。 */
const props = withDefaults(defineProps<{ total: number; template: string; seeking?: boolean }>(), {
  seeking: false,
})
const page = defineModel<number>("page", { required: true })
const dragging = defineModel<boolean>("dragging", { default: false })
const viewport = shallowRef<HTMLElement>()
const height = ref(1)
const width = ref(1)
const ratios = ref<Record<number, number>>({})
const loaded = ref<Set<number>>(new Set())
const failed = ref<Set<number>>(new Set())
const nonces = ref<Record<number, number>>({})
let pointer: { id: number; x: number; y: number; left: number } | undefined
let dragged = false
let scrollTarget: number | undefined
let pendingAnchor: { page: number; relative: number } | undefined
const layout = computed(() => createReaderLayout(props.total, width.value, height.value, ratios.value))

function loadVisible() {
  if (!viewport.value) {
    return
  }
  const { first, last } = layout.value.visiblePages(viewport.value.scrollLeft)
  const kept = new Set<number>()
  for (const pageNumber of loaded.value) {
    if (pageNumber >= first - KEEP_PAGES && pageNumber <= last + KEEP_PAGES) {
      kept.add(pageNumber)
    }
  }
  /* 补充可见页和左右各两页。 */
  for (
    let pageNumber = Math.max(1, first - PRELOAD_PAGES);
    pageNumber <= Math.min(props.total, last + PRELOAD_PAGES);
    pageNumber++
  ) {
    kept.add(pageNumber)
  }
  loaded.value = kept
}
const { start, stop: cancelLoad } = useTimeoutFn(loadVisible, LOAD_DELAY, { immediate: false })
function scheduleLoad() {
  cancelLoad()
  if (dragging.value || props.seeking || scrollTarget !== undefined || !viewport.value) {
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
  if (nextPage !== page.value) {
    page.value = nextPage
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
  dragging.value = true
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
  dragging.value = false
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

async function onImageLoad(pageNumber: number, event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (!viewport.value || !image.naturalWidth || !image.naturalHeight) {
    return
  }
  /* 占位宽度换成真实比例时，维持当前页在视口中的相对位置；同一批到达的图片只锚定一次。 */
  pendingAnchor ??= { page: page.value, relative: viewport.value.scrollLeft - layout.value.offsets[page.value - 1] }
  ratios.value[pageNumber] = image.naturalWidth / image.naturalHeight
  await nextTick()
  if (!viewport.value || !pendingAnchor) {
    return
  }
  const { page: anchor, relative } = pendingAnchor
  pendingAnchor = undefined
  if (scrollTarget !== undefined) {
    await jump(page.value, "smooth")
    return
  }
  viewport.value.scrollLeft = clamp(layout.value.offsets[anchor - 1] + relative, 0, layout.value.maxScroll)
  scheduleLoad()
}
function retry(pageNumber: number) {
  failed.value.delete(pageNumber)
  nonces.value[pageNumber] = (nonces.value[pageNumber] ?? 0) + 1
}

useResizeObserver(viewport, ([entry]) => {
  if (!entry) {
    return
  }
  height.value = Math.max(1, entry.contentRect.height)
  width.value = Math.max(1, entry.contentRect.width)
  void jump(page.value)
})
void jump(page.value)
/* 自己滚出来的页码回流时位置已经对上，只有外部跳页才需要搬动视口。 */
watch(page, (nextPage) => {
  if (
    viewport.value &&
    (scrollTarget !== undefined || nextPage !== layout.value.pageAtScroll(viewport.value.scrollLeft))
  ) {
    void jump(nextPage, props.seeking ? "instant" : "smooth")
  }
})
watch([() => props.seeking, dragging], scheduleLoad)
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
    :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
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
      v-for="pageNumber in total"
      :key="pageNumber"
      class="relative h-full shrink-0"
      :style="{ width: `${layout.widths[pageNumber - 1]}px` }"
    >
      <div
        v-if="failed.has(pageNumber)"
        class="flex h-full flex-col items-center justify-center gap-3 p-4 text-white/80"
      >
        <p class="text-sm">第 {{ pageNumber }} 页加载失败</p>
        <Button variant="outline" class="cursor-pointer" @click.stop="retry(pageNumber)">重试</Button>
      </div>
      <template v-else>
        <div class="absolute inset-0 flex items-center justify-center text-sm text-white/40">
          第 {{ pageNumber }} 页
        </div>
        <img
          v-if="loaded.has(pageNumber)"
          :key="nonces[pageNumber] ?? 0"
          class="relative block h-full w-full object-contain"
          :draggable="false"
          :alt="`第 ${pageNumber} 页`"
          :src="galleryImageUrl(template, pageNumber, { nonce: nonces[pageNumber] })"
          @load="onImageLoad(pageNumber, $event)"
          @error="failed.add(pageNumber)"
        />
      </template>
    </div>
  </div>
</template>
