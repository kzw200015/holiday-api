<script setup lang="ts">
import { ArrowLeftIcon, BookOpenIcon } from "@lucide/vue"
import { computed } from "vue"
import { RouterLink, useRouter } from "vue-router"

import { fetchGalleryComments } from "@/api/eh"
import EmptyState from "@/components/EmptyState.vue"
import ErrorAlert from "@/components/ErrorAlert.vue"
import CommentBody from "@/components/gallery/CommentBody.vue"
import GalleryMeta from "@/components/gallery/GalleryMeta.vue"
import GalleryTag from "@/components/gallery/GalleryTag.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { usePageScroll } from "@/composables/usePageScroll"
import { useQuery } from "@/composables/useQuery"
import { formatDateTime, formatFileSize, formatNamespace, splitTag } from "@/lib/format"
import { backOrReplace } from "@/lib/navigation"
import { useEhStore } from "@/stores/EhStore"

const props = defineProps<{ gid: number; token: string; fromHistory?: boolean }>()
const identity = () => `${props.gid}/${props.token}`
const router = useRouter()
const ehStore = useEhStore()
usePageScroll(identity)

const {
  data: detail,
  error,
  loading,
  retry,
} = useQuery(identity, (_identity, signal) => ehStore.loadGalleryDetail(props.gid, props.token, signal))
const gallery = computed(() => detail.value?.gallery)
const progress = computed(() => ehStore.readingProgress.get(props.gid) ?? null)
const canContinue = computed(() => (progress.value ?? 0) > 1)
/* 评论需要抓取上游页面，独立加载，失败不阻塞元数据。 */
const {
  data: comments,
  error: commentsError,
  loading: commentsLoading,
  retry: retryComments,
} = useQuery(identity, (_identity, signal) => fetchGalleryComments(props.gid, props.token, signal))
const groupedTags = computed(() => {
  const groups = new Map<string, string[]>()
  for (const tag of gallery.value?.tags ?? []) {
    const { namespace, value } = splitTag(tag)
    const group = groups.get(namespace)
    if (group) {
      group.push(value)
    } else {
      groups.set(namespace, [value])
    }
  }
  return [...groups.entries()]
})

function returnToList() {
  backOrReplace(router, { name: props.fromHistory ? "gallery-history" : "gallery-list" })
}
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <Button class="self-start" variant="ghost" @click="returnToList">
      <ArrowLeftIcon />
      返回列表
    </Button>
    <div v-if="loading" class="flex flex-col gap-4 sm:flex-row">
      <Skeleton class="h-72 w-52 shrink-0 rounded-lg" />
      <div class="flex flex-1 flex-col gap-3">
        <Skeleton class="h-7 w-3/4" />
        <Skeleton class="h-4 w-1/2" />
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-20 w-full" />
      </div>
    </div>
    <ErrorAlert v-else-if="error" :message="error.message" title="加载失败" retryable @retry="retry" />
    <template v-else-if="gallery">
      <div class="flex flex-col gap-4 sm:flex-row">
        <img alt="" class="bg-muted h-72 w-52 shrink-0 self-start rounded-lg object-cover" :src="gallery.thumbnail" />
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <div class="flex flex-col gap-1">
            <h2 class="text-lg leading-snug font-semibold">{{ gallery.title }}</h2>
            <p v-if="gallery.titleJpn" class="text-muted-foreground text-sm">{{ gallery.titleJpn }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <GalleryMeta :category="gallery.category" :rating="gallery.rating" />
            <Badge v-if="gallery.expunged" variant="destructive">已删除</Badge>
          </div>
          <dl class="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt>上传者</dt>
            <dd class="text-foreground truncate">{{ gallery.uploader }}</dd>
            <dt>发布时间</dt>
            <dd class="text-foreground">{{ formatDateTime(gallery.postedAt) }}</dd>
            <dt>页数</dt>
            <dd class="text-foreground">{{ gallery.fileCount }} 页</dd>
            <dt>大小</dt>
            <dd class="text-foreground">{{ formatFileSize(gallery.fileSize) }}</dd>
          </dl>
          <div class="flex flex-wrap gap-2">
            <Button as-child>
              <RouterLink
                :to="{
                  name: 'reader',
                  params: { gid: gallery.gid, token: gallery.token, page: progress ?? 1 },
                  query: fromHistory ? { source: 'history' } : {},
                }"
              >
                <BookOpenIcon />
                {{ canContinue ? `继续阅读（第 ${progress} 页）` : "开始阅读" }}
              </RouterLink>
            </Button>
            <Button v-if="canContinue" as-child variant="outline">
              <RouterLink
                :to="{
                  name: 'reader',
                  params: { gid: gallery.gid, token: gallery.token, page: 1 },
                  query: fromHistory ? { source: 'history' } : {},
                }"
              >
                从头开始
              </RouterLink>
            </Button>
          </div>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>标签</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-2">
          <EmptyState v-if="!groupedTags.length" compact message="这个图集还没有标签。" />
          <div
            v-for="[namespace, values] in groupedTags"
            :key="namespace"
            class="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-2"
          >
            <span class="text-muted-foreground text-xs">{{ formatNamespace(namespace) || "未分类" }}</span>
            <div class="flex flex-wrap gap-1">
              <GalleryTag v-for="value in values" :key="value">{{ value }}</GalleryTag>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>评论</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <template v-if="commentsLoading">
            <Skeleton class="h-4 w-1/3" />
            <Skeleton class="h-12 w-full" />
          </template>
          <ErrorAlert
            v-else-if="commentsError"
            :message="commentsError.message"
            title="评论加载失败"
            retryable
            @retry="retryComments"
          />
          <EmptyState v-else-if="comments?.length === 0" compact message="还没有评论。" />
          <template v-else>
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
        </CardContent>
      </Card>
    </template>
  </div>
</template>
