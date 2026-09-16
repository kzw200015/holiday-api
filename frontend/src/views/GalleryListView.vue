<script setup lang="ts">
import { useInfiniteScroll } from "@vueuse/core"
import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, triggerRef } from "vue"

import { searchGalleries, type GalleryCard, type GallerySearch } from "@/api/eh"
import EmptyState from "@/components/EmptyState.vue"
import ErrorAlert from "@/components/ErrorAlert.vue"
import GalleryRow from "@/components/gallery/GalleryRow.vue"
import GallerySearchForm from "@/components/gallery/GallerySearchForm.vue"
import { Skeleton } from "@/components/ui/skeleton"
import { usePageScroll } from "@/composables/usePageScroll"

/* 列表、查询条件与游标随页面一起缓存；分页始终使用已提交的条件。 */
const items = shallowRef<GalleryCard[]>([])
const query = shallowRef<GallerySearch | null>(null)
const cursor = ref<string | null>(null)
const loading = ref(false)
const errorMessage = ref("")
const hasMore = computed(() => cursor.value !== null)
const active = ref(true)
const resetScroll = usePageScroll()
let activeRequest: AbortController | undefined

function clear() {
  activeRequest?.abort()
  activeRequest = undefined
  query.value = null
  items.value = []
  cursor.value = null
  loading.value = false
  errorMessage.value = ""
}

function search(next: GallerySearch) {
  const categories = [...new Set(next.categories)].sort()
  if (query.value?.keyword === next.keyword && query.value.categories.join(",") === categories.join(",")) {
    return
  }
  clear()
  query.value = { keyword: next.keyword, categories }
  cursor.value = ""
  void loadMore()
}

async function loadMore() {
  if (!query.value || loading.value || cursor.value === null || errorMessage.value) {
    return
  }
  const controller = new AbortController()
  activeRequest = controller
  loading.value = true
  try {
    const page = await searchGalleries({ ...query.value, cursor: cursor.value }, controller.signal)
    if (controller.signal.aborted) {
      return
    }
    /* 原地追加，避免翻页越多、复制已有条目的开销越大。 */
    items.value.push(...page.items)
    triggerRef(items)
    cursor.value = page.nextCursor
  } catch (error) {
    if (!controller.signal.aborted) {
      errorMessage.value = (error as Error).message
    }
  } finally {
    if (!controller.signal.aborted) {
      loading.value = false
    }
  }
}

function retry() {
  errorMessage.value = ""
  void loadMore()
}

function submitSearch(next: GallerySearch) {
  search(next)
  void resetScroll()
}

function restoreSearch(next: GallerySearch) {
  const previousCategories = query.value?.categories.join(",") ?? ""
  search(next)
  /* 分类没有变化时保留来源列表与滚动位置，也不提交表单中的关键词草稿。 */
  if (previousCategories !== query.value?.categories.join(",")) {
    void resetScroll()
  }
}

onActivated(() => {
  active.value = true
})
onDeactivated(() => {
  active.value = false
})
onScopeDispose(clear)

/* 停用时拆掉滚动监听，其他页面滚动不触发加载。 */
useInfiniteScroll(() => (active.value ? window : null), loadMore, {
  distance: 600,
  canLoadMore: () => hasMore.value && !loading.value && !errorMessage.value,
})
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <GallerySearchForm @search="submitSearch" @restore="restoreSearch" />
    <div class="flex flex-col gap-3">
      <GalleryRow v-for="item in items" :key="`${item.gid}-${item.token}`" :item="item" />
      <template v-if="loading">
        <div v-for="index in 3" :key="index" class="flex gap-3">
          <Skeleton class="h-40 w-28 shrink-0 rounded-lg" />
          <div class="flex flex-1 flex-col gap-2 py-1">
            <Skeleton class="h-5 w-3/4" />
            <Skeleton class="h-4 w-1/2" />
            <Skeleton class="h-4 w-2/3" />
          </div>
        </div>
      </template>
      <ErrorAlert v-if="errorMessage" :message="errorMessage" title="加载失败" retryable @retry="retry" />
      <EmptyState v-if="query && !loading && !errorMessage && items.length === 0" message="没有找到符合条件的图集。" />
      <p v-if="!hasMore && !errorMessage && items.length > 0" class="text-muted-foreground py-6 text-center text-sm">
        已经到底了。
      </p>
    </div>
  </div>
</template>
