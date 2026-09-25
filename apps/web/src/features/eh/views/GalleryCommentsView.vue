<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import GalleryCommentList from "@/features/eh/components/GalleryCommentList.vue"
import { useGallery } from "@/features/eh/composables/useGallery"
import { useGalleryComments } from "@/features/eh/composables/useGalleryComments"
import EmptyState from "@/shared/components/EmptyState.vue"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"

/*
 * 一本图集的全部评论。和详情页读的是同一份：e 站默认列出的那些，得分低于阈值的只说有几条。
 * 返回详情的按钮在顶栏（见路由的 meta.back）；标题取自详情页已经读过的元数据。
 */
const props = defineProps<{ gid: number; token: string }>()

const { gallery } = useGallery(
  () => props.gid,
  () => props.token,
)
const { comments, hiddenCount, loading, errorMessage, reload } = useGalleryComments(
  () => props.gid,
  () => props.token,
)
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <h2 v-if="gallery" class="text-lg leading-snug font-semibold">{{ gallery.title }}</h2>
    <Card>
      <CardHeader>
        <CardTitle>全部评论</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <template v-if="loading">
          <Skeleton class="h-4 w-1/3" />
          <Skeleton class="h-12 w-full" />
        </template>
        <ErrorAlert v-else-if="errorMessage" :message="errorMessage" title="评论加载失败" retryable @retry="reload" />
        <template v-else-if="comments">
          <EmptyState v-if="comments.length === 0 && hiddenCount === 0" compact message="还没有评论。" />
          <GalleryCommentList :comments="comments" />
          <p v-if="hiddenCount > 0" class="text-muted-foreground text-sm">另有 {{ hiddenCount }} 条低分评论未显示</p>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
