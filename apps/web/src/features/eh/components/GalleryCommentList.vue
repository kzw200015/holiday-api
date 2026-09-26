<script setup lang="ts">
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { GalleryComment } from "@/features/eh/api"
import CommentBody from "@/features/eh/components/CommentBody.vue"
import { formatDateTime } from "@/shared/lib/format"

/* 一串评论，条与条之间用分隔线隔开。详情页列前几条，评论页列全部。 */
defineProps<{ comments: GalleryComment[] }>()
</script>

<template>
  <div v-for="(comment, index) in comments" :key="comment.id" class="flex flex-col gap-2">
    <Separator v-if="index > 0" />
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="font-medium">{{ comment.author }}</span>
      <Badge v-if="comment.isUploader" variant="outline">上传者</Badge>
      <span class="text-muted-foreground">{{ formatDateTime(comment.postedAt) }}</span>
      <span v-if="comment.score" class="text-muted-foreground">{{ comment.score }}</span>
    </div>
    <CommentBody :segments="comment.segments" />
  </div>
</template>
