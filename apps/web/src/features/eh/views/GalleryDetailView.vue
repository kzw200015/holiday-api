<script setup lang="ts">
import { BookOpenIcon } from "@lucide/vue"
import { computed } from "vue"
import { RouterLink, useRouter } from "vue-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { GalleryDetail } from "@/features/eh/api"
import GalleryCommentList from "@/features/eh/components/GalleryCommentList.vue"
import GalleryCover from "@/features/eh/components/GalleryCover.vue"
import GalleryMeta from "@/features/eh/components/GalleryMeta.vue"
import GalleryPreviews from "@/features/eh/components/GalleryPreviews.vue"
import GalleryTag from "@/features/eh/components/GalleryTag.vue"
import { useGallery } from "@/features/eh/composables/useGallery"
import { useGalleryComments } from "@/features/eh/composables/useGalleryComments"
import { tagKeyword, uploaderKeyword, useGallerySearchStore } from "@/features/eh/composables/useGallerySearchStore"
import { useGalleryProgress } from "@/features/eh/composables/useReadingProgress"
import {
  galleryCommentsLocation,
  galleryListLocation,
  readerLocation,
  type GallerySource,
} from "@/features/eh/navigation"
import EmptyState from "@/shared/components/EmptyState.vue"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"
import { usePageScroll } from "@/shared/composables/usePageScroll"
import { useRefreshOnActivated } from "@/shared/composables/useRefreshOnActivated"
import { formatDateTime, formatFileSize } from "@/shared/lib/format"

/* 返回列表的按钮在顶栏（见路由的 meta.back），滚到评论区也点得到，页面里不再放一份。 */
const props = withDefaults(defineProps<{ gid: number; token: string; source?: GallerySource }>(), { source: "search" })
const identity = () => `${props.gid}/${props.token}`
usePageScroll(identity)

const { gallery, loading, errorMessage, refreshError, reload } = useGallery(
  () => props.gid,
  () => props.token,
)
const { progress, reload: reloadProgress } = useGalleryProgress(() => props.gid)
/* 页面被 KeepAlive 留着，每次回来都重读，好拿到别处读过的进度。 */
useRefreshOnActivated(reload, reloadProgress)
const canContinue = computed(() => (progress.value ?? 0) > 1)
/* 评论需要抓取上游页面，独立加载，失败不阻塞元数据。详情页只列前几条，其余的去评论页看。 */
const COMMENT_LIMIT = 5
const {
  comments,
  loading: commentsLoading,
  errorMessage: commentsErrorMessage,
  reload: reloadComments,
} = useGalleryComments(
  () => props.gid,
  () => props.token,
)
/* 点标签、上传者就去搜索页按它搜：提交当场开始，搜索页回来时显示的就是它。 */
const searchStore = useGallerySearchStore()
const router = useRouter()
/* 从阅读历史进来的也去搜索页，不回来源列表 */
function searchFor(keyword: string) {
  searchStore.submit({ keyword })
  void router.push(galleryListLocation("search"))
}
/* 按命名空间分组，组的顺序就是命名空间第一次出现的顺序。 */
const groupedTags = computed(() => {
  const groups = new Map<string, { namespaceName: string; tags: GalleryDetail["tags"] }>()
  for (const tag of gallery.value?.tags ?? []) {
    const group = groups.get(tag.namespace)
    if (group) {
      group.tags.push(tag)
    } else {
      groups.set(tag.namespace, { namespaceName: tag.namespaceName, tags: [tag] })
    }
  }
  return [...groups.entries()]
})
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <div v-if="loading" class="flex flex-col gap-4 sm:flex-row">
      <Skeleton class="h-72 w-52 shrink-0 rounded-lg" />
      <div class="flex flex-1 flex-col gap-3">
        <Skeleton class="h-7 w-3/4" />
        <Skeleton class="h-4 w-1/2" />
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-20 w-full" />
      </div>
    </div>
    <ErrorAlert v-else-if="errorMessage" :message="errorMessage" title="加载失败" retryable @retry="reload" />
    <template v-else-if="gallery">
      <!-- 重读失败：手上这份照常显示，只提示一下。 -->
      <ErrorAlert
        v-if="refreshError"
        :message="refreshError"
        title="刷新失败，显示的是之前读到的内容"
        retryable
        @retry="reload"
      />
      <div class="flex flex-col gap-4 sm:flex-row">
        <GalleryCover class="h-72 w-52 shrink-0 self-start" :src="gallery.thumbnail" />
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
            <dd>
              <GalleryTag
                as="button"
                type="button"
                :title="`搜索上传者 ${gallery.uploader}`"
                @click="searchFor(uploaderKeyword(gallery.uploader))"
              >
                {{ gallery.uploader }}
              </GalleryTag>
            </dd>
            <dt>发布时间</dt>
            <dd class="text-foreground">{{ formatDateTime(gallery.postedAt) }}</dd>
            <dt>页数</dt>
            <dd class="text-foreground">{{ gallery.fileCount }} 页</dd>
            <dt>大小</dt>
            <dd class="text-foreground">{{ formatFileSize(gallery.fileSize) }}</dd>
          </dl>
          <div class="flex flex-wrap gap-2">
            <Button as-child>
              <RouterLink :to="readerLocation(gallery, progress ?? 1, source)">
                <BookOpenIcon />
                {{ canContinue ? `继续阅读（第 ${progress} 页）` : "开始阅读" }}
              </RouterLink>
            </Button>
            <Button v-if="canContinue" as-child variant="outline">
              <RouterLink :to="readerLocation(gallery, 1, source)"> 从头开始</RouterLink>
            </Button>
          </div>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>标签</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState v-if="!groupedTags.length" compact message="这个图集还没有标签。" />
          <!--
            所有命名空间共用一个网格：左列宽度随最长的命名空间名走，各组标签的起点仍然对齐。
            译名后面跟着浅色的原文；没有译名时两者相同，只显示一次。
          -->
          <div v-else class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2">
            <template v-for="[namespace, group] in groupedTags" :key="namespace">
              <span class="text-xs whitespace-nowrap">
                {{ group.namespaceName }}
                <span v-if="group.namespaceName !== namespace" class="text-muted-foreground">{{ namespace }}</span>
              </span>
              <div class="flex flex-wrap gap-1">
                <GalleryTag
                  v-for="tag in group.tags"
                  :key="tag.value"
                  as="button"
                  type="button"
                  :title="`搜索标签 ${namespace}:${tag.value}`"
                  @click="searchFor(tagKeyword(tag))"
                >
                  {{ tag.name }}
                  <span v-if="tag.name !== tag.value" class="text-muted-foreground">{{ tag.value }}</span>
                </GalleryTag>
              </div>
            </template>
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
            v-else-if="commentsErrorMessage"
            :message="commentsErrorMessage"
            title="评论加载失败"
            retryable
            @retry="reloadComments"
          />
          <EmptyState v-else-if="comments?.length === 0" compact message="还没有评论。" />
          <template v-else-if="comments">
            <GalleryCommentList :comments="comments.slice(0, COMMENT_LIMIT)" />
            <Button v-if="comments.length > COMMENT_LIMIT" as-child class="self-start" variant="outline">
              <RouterLink :to="galleryCommentsLocation({ gid, token }, source)">
                查看全部 {{ comments.length }} 条评论
              </RouterLink>
            </Button>
          </template>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>预览</CardTitle>
        </CardHeader>
        <CardContent>
          <!-- 换图集时整个重建：已经进过视口的分片、取不到的图都不该带到另一本上。 -->
          <GalleryPreviews
            :key="identity()"
            :gid="gid"
            :token="token"
            :file-count="gallery.fileCount"
            :progress="progress"
            :source="source"
          />
        </CardContent>
      </Card>
    </template>
  </div>
</template>
