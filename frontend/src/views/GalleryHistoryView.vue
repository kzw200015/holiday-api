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

const { items, loading, loadingMore, hasMore, busy, loadError, changeError, refresh, remove, clear, retry } =
  useReadingHistory()
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-muted-foreground text-sm">按最近阅读时间排序，删除记录也会删除阅读进度。</p>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="busy" @click="refresh">
          <RefreshCwIcon />
          刷新
        </Button>
        <ConfirmDialog
          title="清空阅读历史？"
          description="所有阅读记录和阅读进度都将删除，此操作无法撤销。"
          confirm-text="清空"
          @confirm="clear"
        >
          <Button variant="destructive" size="sm" :disabled="busy || items.length === 0">
            <Trash2Icon />
            清空全部
          </Button>
        </ConfirmDialog>
      </div>
    </div>
    <ErrorAlert v-if="changeError" title="操作失败" :message="changeError" />
    <ErrorAlert v-if="loadError" title="加载失败" :message="loadError" retryable @retry="retry" />
    <div v-for="item in items" :key="item.gid" class="rounded-lg border p-2">
      <GalleryRow v-if="item.gallery" :item="item.gallery" source="history" />
      <div v-else class="flex flex-col gap-1 p-2">
        <p class="font-medium">失效记录 · 图集 {{ item.gid }}</p>
        <p class="text-muted-foreground text-sm">无法获取图集信息，可能已删除或不可访问。</p>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
        <p class="text-muted-foreground text-xs">最近阅读：{{ formatDateTime(item.readAt) }} · 第 {{ item.page }} 页</p>
        <div class="flex gap-2">
          <Button v-if="item.gallery" as-child size="sm" variant="outline">
            <RouterLink :to="readerLocation(item, item.page, { kind: 'history' })">
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
    <div v-if="loading || loadingMore" class="flex flex-col gap-3">
      <Skeleton v-for="index in 3" :key="index" class="h-48 w-full rounded-lg" />
    </div>
    <EmptyState v-if="!loading && !loadError && items.length === 0" message="还没有阅读记录。" />
    <p v-if="!hasMore && !loadError && items.length > 0" class="text-muted-foreground py-6 text-center text-sm">
      已经到底了。
    </p>
  </div>
</template>
