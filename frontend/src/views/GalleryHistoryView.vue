<script setup lang="ts">
import { BookOpenIcon, RefreshCwIcon, Trash2Icon } from "@lucide/vue"
import { RouterLink } from "vue-router"

import ConfirmDialog from "@/components/ConfirmDialog.vue"
import EmptyState from "@/components/EmptyState.vue"
import ErrorAlert from "@/components/ErrorAlert.vue"
import GalleryRow from "@/components/gallery/GalleryRow.vue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useReadingHistory } from "@/composables/useReadingHistory"
import { formatDateTime } from "@/lib/format"
import { readerLocation } from "@/lib/galleryNavigation"

const {
  items,
  pageIndex,
  progress,
  loading,
  busy,
  loadError,
  changeError,
  hasPrevious,
  hasNext,
  load,
  remove,
  clear,
  retry,
} = useReadingHistory()
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-muted-foreground text-sm">按最近阅读时间排序，删除记录也会删除阅读进度。</p>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="busy" @click="load(0, true)">
          <RefreshCwIcon />
          刷新
        </Button>
        <ConfirmDialog
          title="清空阅读历史？"
          description="所有阅读记录和阅读进度都将删除，此操作无法撤销。"
          confirm-text="清空"
          @confirm="clear"
        >
          <Button variant="destructive" size="sm" :disabled="busy || (items.length === 0 && pageIndex === 0)">
            <Trash2Icon />
            清空全部
          </Button>
        </ConfirmDialog>
      </div>
    </div>
    <ErrorAlert v-if="changeError" title="操作失败" :message="changeError" />
    <ErrorAlert v-if="loadError" title="加载失败" :message="loadError" retryable @retry="retry" />
    <div v-if="loading && items.length === 0" class="flex flex-col gap-3">
      <Skeleton v-for="index in 3" :key="index" class="h-48 w-full rounded-lg" />
    </div>
    <div v-for="item in items" :key="item.gid" class="rounded-lg border p-2" :aria-busy="loading">
      <GalleryRow v-if="item.gallery" :item="item.gallery" source="history" />
      <div v-else class="flex flex-col gap-1 p-2">
        <p class="font-medium">失效记录 · 图集 {{ item.gid }}</p>
        <p class="text-muted-foreground text-sm">无法获取图集信息，可能已删除或不可访问。</p>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
        <p class="text-muted-foreground text-xs">
          最近阅读：{{ formatDateTime(item.readAt) }} · 第 {{ progress.get(item.gid) }} 页
        </p>
        <div class="flex gap-2">
          <Button v-if="item.gallery" as-child size="sm" variant="outline">
            <RouterLink :to="readerLocation(item, progress.get(item.gid) ?? 1, { kind: 'history' })">
              <BookOpenIcon />继续阅读
            </RouterLink>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            :disabled="busy"
            :aria-label="`删除阅读记录：${item.gid}`"
            @click="remove(item.gid)"
          >
            <Trash2Icon />删除
          </Button>
        </div>
      </div>
    </div>
    <EmptyState
      v-if="!loading && !loadError && items.length === 0"
      :message="pageIndex === 0 ? '还没有阅读记录。' : '这一页已没有记录，可返回上一页或刷新。'"
    />
    <div v-if="items.length > 0 || pageIndex > 0" class="flex items-center justify-center gap-4">
      <Button variant="outline" :disabled="busy || !hasPrevious" @click="load(pageIndex - 1, true)">上一页</Button>
      <span class="text-muted-foreground text-sm">第 {{ pageIndex + 1 }} 页{{ loading ? " · 加载中" : "" }}</span>
      <Button variant="outline" :disabled="busy || !hasNext" @click="load(pageIndex + 1, true)">下一页</Button>
    </div>
  </div>
</template>
