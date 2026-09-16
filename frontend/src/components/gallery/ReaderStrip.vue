<script setup lang="ts">
import { watch } from "vue"

import { galleryImageUrl } from "@/api/eh"
import { Button } from "@/components/ui/button"
import { useReaderStrip } from "@/composables/useReaderStrip"

/* 换图集由父级以 key 整体重建，这里只管一本图集内的滚动与加载。 */
const props = withDefaults(defineProps<{ page: number; total: number; template: string; seeking?: boolean }>(), {
  seeking: false,
})
const emit = defineEmits<{ pageChange: [page: number]; draggingChange: [dragging: boolean] }>()
const strip = useReaderStrip(props, (page) => emit("pageChange", page))
const {
  dragging,
  widths,
  failed,
  loaded,
  nonces,
  retry,
  imageLoaded,
  onScroll,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
} = strip
watch(dragging, (value) => emit("draggingChange", value), { flush: "sync" })

function onImageLoad(page: number, event: Event) {
  void imageLoaded(page, event.currentTarget as HTMLImageElement)
}
</script>

<template>
  <div
    :ref="strip.viewport"
    aria-label="横向阅读区域"
    class="no-scrollbar flex min-h-0 min-w-0 flex-1 touch-pan-x select-none overflow-x-auto overflow-y-hidden overscroll-x-contain"
    :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
    style="overflow-anchor: none"
    @scroll="onScroll"
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
      :style="{ width: `${widths[pageNumber - 1]}px` }"
    >
      <div
        v-if="failed.has(pageNumber)"
        class="flex h-full flex-col items-center justify-center gap-3 p-4 text-white/80"
      >
        <p class="text-sm">第 {{ pageNumber }} 页加载失败</p>
        <Button variant="outline" class="cursor-pointer" @click="retry(pageNumber)">重试</Button>
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
