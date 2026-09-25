<script setup lang="ts">
import { useIntersectionObserver, useTimeoutFn } from "@vueuse/core"
import { ref, useTemplateRef } from "vue"
import { RouterLink } from "vue-router"

import { Button } from "@/components/ui/button"
import GalleryPreviewImage from "@/features/eh/components/GalleryPreviewImage.vue"
import { useSlicePreviews } from "@/features/eh/composables/useGalleryPreviews"
import { readerLocation, type GallerySource } from "@/features/eh/navigation"

/* 详情页上一片预览图的各页。各格直接排进外层的换行容器，不自成一块。点哪一格就从哪一页开始读，图没出来也能点。 */
const props = defineProps<{
  gid: number
  token: string
  index: number
  pages: number[]
  progress: number | null
  source: GallerySource
}>()

/*
 * 第 0 片一打开就取（要靠它知道每片几页）；其余的等某一格在视口附近停够 DWELL 才取，快速滚过去的不取，
 * 免得一路滑到底把沿途每一片都向 e 站抓一遍。取过一次就不再观察。
 */
const DWELL = 200
const cells = useTemplateRef<HTMLAnchorElement[]>("cells")
const wanted = ref(props.index === 0)
const nearViewport = new Set<Element>()
const dwell = useTimeoutFn(
  () => {
    wanted.value = true
    stopObserving()
  },
  DWELL,
  { immediate: false },
)
const { stop: stopObserving } = useIntersectionObserver(
  () => (wanted.value ? [] : (cells.value ?? [])),
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        nearViewport.add(entry.target)
      } else {
        nearViewport.delete(entry.target)
      }
    }
    if (nearViewport.size === 0) {
      dwell.stop()
    } else if (!dwell.isPending.value) {
      dwell.start()
    }
  },
  { rootMargin: "400px" },
)

const { previews, errorMessage, reload } = useSlicePreviews(
  () => props.gid,
  () => props.token,
  () => props.index,
  wanted,
)
</script>

<template>
  <!-- 高度与格子对齐，排在这一片的开头：哪一段没取到一眼看得出。各格照常能点。 -->
  <Button v-if="errorMessage" class="h-35" variant="outline" @click="reload">
    第 {{ pages[0] }}–{{ pages.at(-1) }} 页没取到，重试
  </Button>
  <RouterLink
    v-for="page in pages"
    :key="page"
    v-slot="{ href, navigate }"
    custom
    :to="readerLocation({ gid, token }, page, source)"
  >
    <a
      ref="cells"
      class="flex flex-col items-center gap-1"
      :aria-label="`第 ${page} 页`"
      :href="href"
      @click="navigate"
    >
      <GalleryPreviewImage :preview="previews.get(page)" :current="page === progress" />
      <span v-if="page === progress" class="text-primary text-xs font-medium">{{ page }} · 读到这里</span>
      <span v-else class="text-muted-foreground text-xs">{{ page }}</span>
    </a>
  </RouterLink>
</template>
