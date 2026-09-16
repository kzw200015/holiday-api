<script setup lang="ts">
import { RouterLink } from "vue-router"

import type { GalleryCard } from "@/api/eh"
import GalleryMeta from "@/components/gallery/GalleryMeta.vue"
import GalleryTag from "@/components/gallery/GalleryTag.vue"
import { formatDateTime } from "@/lib/format"

defineProps<{ item: GalleryCard }>()
</script>

<template>
  <RouterLink
    class="hover:bg-accent/50 flex gap-3 rounded-lg p-2 transition-colors"
    :to="{ name: 'gallery-detail', params: { gid: item.gid, token: item.token } }"
  >
    <img alt="" class="bg-muted h-40 w-28 shrink-0 rounded-lg object-cover" loading="lazy" :src="item.thumbnail" />
    <div class="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
      <p class="line-clamp-2 text-sm leading-snug font-medium">{{ item.title }}</p>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <GalleryMeta :category="item.category" compact :rating="item.rating" />
        <span class="text-muted-foreground">{{ item.fileCount }} 页</span>
      </div>
      <p class="text-muted-foreground truncate text-xs">{{ item.uploader }} · {{ formatDateTime(item.postedAt) }}</p>
      <!-- 标签只露前几个，全部标签在详情页看。 -->
      <div class="flex flex-wrap gap-1">
        <GalleryTag v-for="tag in item.tags.slice(0, 6)" :key="tag">{{ tag }}</GalleryTag>
      </div>
    </div>
  </RouterLink>
</template>
