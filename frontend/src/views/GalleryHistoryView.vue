<script setup lang="ts">
import { BookOpenIcon, RefreshCwIcon, Trash2Icon } from "@lucide/vue"
import { onActivated, onDeactivated, onScopeDispose, ref, shallowRef } from "vue"
import { RouterLink } from "vue-router"

import ConfirmDialog from "@/components/ConfirmDialog.vue"
import EmptyState from "@/components/EmptyState.vue"
import ErrorAlert from "@/components/ErrorAlert.vue"
import GalleryRow from "@/components/gallery/GalleryRow.vue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { usePageScroll } from "@/composables/usePageScroll"
import { formatDateTime } from "@/lib/format"
import { readerLocation } from "@/lib/galleryNavigation"
import { useEhStore, type ReadingHistoryEntry } from "@/stores/EhStore"

const ehStore = useEhStore()
const items = shallowRef<ReadingHistoryEntry[]>([])
const cursors = ref([""])
const pageIndex = ref(0)
const loading = ref(false)
const changing = ref(false)
const loadError = ref("")
const changeError = ref("")
const resetScroll = usePageScroll()
let requestedPage = 0
let activeRequest: AbortController | undefined
let disposed = false
let active = false

async function load(index = pageIndex.value, resetPosition = false) {
  activeRequest?.abort()
  const controller = new AbortController()
  activeRequest = controller
  requestedPage = index
  loading.value = true
  loadError.value = ""
  try {
    const result = await ehStore.loadReadingHistory(cursors.value[index] ?? "", controller.signal)
    if (controller.signal.aborted) {
      return
    }
    items.value = result.items
    pageIndex.value = index
    cursors.value = cursors.value.slice(0, index + 1)
    if (result.nextCursor !== null) {
      cursors.value.push(result.nextCursor)
    }
    if (resetPosition) {
      void resetScroll()
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      loadError.value = (error as Error).message
    }
  } finally {
    if (!controller.signal.aborted) {
      loading.value = false
    }
  }
}

async function remove(gid: number) {
  if (loading.value || changing.value) {
    return
  }
  changing.value = true
  changeError.value = ""
  try {
    await ehStore.removeReadingHistory(gid)
    if (disposed) {
      return
    }
    items.value = items.value.filter((item) => item.gid !== gid)
    /* 删除末页最后一条时回到上一页，其余情况补齐当前页。 */
    if (active) {
      await load(items.value.length === 0 ? Math.max(0, pageIndex.value - 1) : pageIndex.value)
    }
  } catch (error) {
    if (!disposed) {
      changeError.value = (error as Error).message
    }
  } finally {
    changing.value = false
  }
}

async function clear() {
  if (loading.value || changing.value) {
    return
  }
  changing.value = true
  changeError.value = ""
  try {
    await ehStore.clearReadingHistory()
    if (disposed) {
      return
    }
    items.value = []
    cursors.value = [""]
    pageIndex.value = 0
    loadError.value = ""
    if (active) {
      void resetScroll()
    }
  } catch (error) {
    if (!disposed) {
      changeError.value = (error as Error).message
    }
  } finally {
    changing.value = false
  }
}

/* 保留当前页与滚动位置，但重新读取进度，以反映本次阅读及其他设备的修改。 */
onActivated(() => {
  active = true
  if (!changing.value) {
    void load()
  }
})
onDeactivated(() => {
  active = false
  activeRequest?.abort()
  loading.value = false
})
onScopeDispose(() => {
  disposed = true
  activeRequest?.abort()
})
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-muted-foreground text-sm">按最近阅读时间排序，删除记录也会删除阅读进度。</p>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="loading || changing" @click="load(0, true)">
          <RefreshCwIcon />
          刷新
        </Button>
        <ConfirmDialog
          title="清空阅读历史？"
          description="所有阅读记录和阅读进度都将删除，此操作无法撤销。"
          confirm-text="清空"
          @confirm="clear"
        >
          <Button
            variant="destructive"
            size="sm"
            :disabled="loading || changing || (items.length === 0 && pageIndex === 0)"
          >
            <Trash2Icon />
            清空全部
          </Button>
        </ConfirmDialog>
      </div>
    </div>
    <ErrorAlert v-if="changeError" title="操作失败" :message="changeError" />
    <ErrorAlert v-if="loadError" title="加载失败" :message="loadError" retryable @retry="load(requestedPage)" />
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
          最近阅读：{{ formatDateTime(item.readAt) }} · 第 {{ ehStore.readingProgress.get(item.gid) }} 页
        </p>
        <div class="flex gap-2">
          <Button v-if="item.gallery" as-child size="sm" variant="outline">
            <RouterLink :to="readerLocation(item, ehStore.readingProgress.get(item.gid) ?? 1, { kind: 'history' })">
              <BookOpenIcon />继续阅读
            </RouterLink>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            :disabled="loading || changing"
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
      <Button variant="outline" :disabled="loading || changing || pageIndex === 0" @click="load(pageIndex - 1, true)"
        >上一页</Button
      >
      <span class="text-muted-foreground text-sm">第 {{ pageIndex + 1 }} 页{{ loading ? " · 加载中" : "" }}</span>
      <Button
        variant="outline"
        :disabled="loading || changing || pageIndex + 1 >= cursors.length"
        @click="load(pageIndex + 1, true)"
        >下一页</Button
      >
    </div>
  </div>
</template>
