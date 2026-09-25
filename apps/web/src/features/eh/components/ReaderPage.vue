<script setup lang="ts">
import { ref } from "vue"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { usePageImage } from "@/features/eh/composables/usePageImage"

/*
 * 阅读器里正在取图的一页：签地址、取图、失败与重试都只关这一页，状态变了也只重渲染这一页。
 * 由 ReaderStrip 在这页进入加载窗口时挂载、离开保留窗口时卸载，失败与重试的状态随之清掉，回来时重新签、从头取；
 * 没挂载时的「第 N 页」占位由 ReaderStrip 显示。一个实例只管一页，图集与页码当常量用。eager：停下时这页在视口里，优先取。
 */
const props = defineProps<{ gid: number; token: string; page: number; eager: boolean }>()
const emit = defineEmits<{ ratio: [ratio: number] }>()
const { src, loading, failed, fail, retry } = usePageImage(props.gid, props.token, props.page)
const arrived = ref(false)

function onLoad(event: Event) {
  arrived.value = true
  const image = event.currentTarget
  if (image instanceof HTMLImageElement && image.naturalWidth && image.naturalHeight) {
    emit("ratio", image.naturalWidth / image.naturalHeight)
  }
}
</script>

<template>
  <div v-if="failed" class="flex h-full flex-col items-center justify-center gap-3 p-4 text-white/80">
    <p class="text-sm">第 {{ page }} 页加载失败</p>
    <!-- 重试途中转圈，再点不会重复去签。 -->
    <Button variant="outline" @click.stop="retry">
      <Spinner v-if="loading" aria-label="重试中" />
      重试
    </Button>
  </div>
  <template v-else>
    <!-- 还没到时转圈，看得出是在加载，而不是卡住了。 -->
    <div v-if="!arrived" class="absolute inset-0 flex items-center justify-center text-white/40">
      <Spinner aria-label="加载中" />
    </div>
    <!-- 换了地址（重试）就换一个 img，浏览器才会重新去取。 -->
    <img
      v-if="src"
      :key="src"
      class="relative block h-full w-full object-contain"
      :draggable="false"
      decoding="async"
      :fetchpriority="eager ? 'high' : 'low'"
      :alt="`第 ${page} 页`"
      :src="src"
      @load="onLoad"
      @error="fail"
    />
  </template>
</template>
