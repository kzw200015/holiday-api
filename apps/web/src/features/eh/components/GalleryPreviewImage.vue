<script setup lang="ts">
import { computed, ref, watch } from "vue"

import type { GalleryPreview } from "@/features/eh/api"

/*
 * 一页预览图，高度固定、宽度按原图比例。e 站给的可能是一片拼成的一张图，统一按「从图上 (offsetX, offsetY) 处裁出
 * width × height」显示：图保持原始大小，先平移到裁剪起点再整体缩放，不必知道整张拼图有多大。
 * 还没取到或者取不到时停在同样大小的底色上。
 */
const props = defineProps<{ preview?: GalleryPreview; current?: boolean }>()

/* 与模板里的 h-35 对齐 */
const HEIGHT = 140
/* 还不知道这页的比例时按常见的竖版图占位 */
const PLACEHOLDER_WIDTH = 100

const broken = ref(false)
watch(
  () => props.preview?.url,
  () => {
    broken.value = false
  },
)
/*
 * 带偏移的（拼图）不懒加载：图没到手时 <img> 是 0×0，平移后落在外框裁剪区之外，Safari 据此认定它不可见、永远不取，
 * 一片里就只有偏移为 0 的第一格出图。拼图各格共用少数几张图，而且这一片滚到附近才拿得到预览数据，不懒加载也多取不了几张。
 */
const loading = computed(() =>
  props.preview && (props.preview.offsetX > 0 || props.preview.offsetY > 0) ? "eager" : "lazy",
)
const scale = computed(() => (props.preview ? HEIGHT / props.preview.height : 1))
const width = computed(() => (props.preview ? Math.round(props.preview.width * scale.value) : PLACEHOLDER_WIDTH))
</script>

<template>
  <div
    class="bg-muted relative h-35 shrink-0 overflow-hidden rounded-md"
    :class="current ? 'ring-primary ring-2 ring-offset-2' : undefined"
    :style="{ width: `${width}px` }"
  >
    <img
      v-if="preview && !broken"
      alt=""
      class="absolute top-0 left-0 max-w-none origin-top-left"
      :loading="loading"
      :src="preview.url"
      :style="{ transform: `scale(${scale}) translate(${-preview.offsetX}px, ${-preview.offsetY}px)` }"
      @error="broken = true"
    />
  </div>
</template>
