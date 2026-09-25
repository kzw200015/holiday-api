<script setup lang="ts">
import GalleryPreviewSlice from "@/features/eh/components/GalleryPreviewSlice.vue"
import { usePreviewSlices } from "@/features/eh/composables/useGalleryPreviews"
import type { GallerySource } from "@/features/eh/navigation"

/* 一本图集全部页的预览：一打开就摆出每一页的占位，横向排、放不下就换行。 */
const props = defineProps<{
  gid: number
  token: string
  fileCount: number
  progress: number | null
  source: GallerySource
}>()

const slices = usePreviewSlices(
  () => props.gid,
  () => props.token,
  () => props.fileCount,
)
</script>

<template>
  <div class="flex flex-wrap gap-3">
    <GalleryPreviewSlice
      v-for="slice in slices"
      :key="slice.index"
      :gid="gid"
      :token="token"
      :index="slice.index"
      :pages="slice.pages"
      :progress="progress"
      :source="source"
    />
  </div>
</template>
