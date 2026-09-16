<script setup lang="ts">
import { SearchIcon, XIcon } from "@lucide/vue"
import { useInfiniteScroll } from "@vueuse/core"
import { onActivated, onDeactivated, ref } from "vue"

import ConfirmDialog from "@/components/ConfirmDialog.vue"
import EmptyState from "@/components/EmptyState.vue"
import ErrorAlert from "@/components/ErrorAlert.vue"
import CategoryFilter from "@/components/gallery/CategoryFilter.vue"
import GalleryRow from "@/components/gallery/GalleryRow.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useGalleryCategories } from "@/composables/useGalleryCategories"
import { useGalleryList } from "@/composables/useGalleryList"
import { usePageScroll } from "@/composables/usePageScroll"
import { useSearchHistory } from "@/composables/useSearchHistory"
import { useAuthStore } from "@/stores/AuthStore"

const { items, loading, errorMessage, hasMore, search, loadMore, retry } = useGalleryList()
const userId = useAuthStore().user?.id
const { entries, record, remove, clear } = useSearchHistory(userId)
const { selected, apply } = useGalleryCategories(userId)
const active = ref(true)
onActivated(() => {
  active.value = true
})
onDeactivated(() => {
  active.value = false
})
const resetScroll = usePageScroll()
const keyword = ref("")
/* 新组件只恢复分类；KeepAlive 激活不重新搜索，也不覆盖尚未提交的输入。 */
void search({ keyword: "", categories: selected.value })

function runSearch() {
  keyword.value = keyword.value.trim()
  record(keyword.value)
  void search({ keyword: keyword.value, categories: selected.value })
  void resetScroll()
}

function applyCategories(categories: string[]) {
  apply(categories)
  runSearch()
}

function searchHistory(entry: string) {
  keyword.value = entry
  runSearch()
}

/* 停用时拆掉滚动监听，其他页面滚动不触发加载。 */
useInfiniteScroll(() => (active.value ? window : null), loadMore, {
  distance: 600,
  canLoadMore: () => hasMore.value && !loading.value && !errorMessage.value,
})
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <div class="flex flex-col gap-3">
      <form class="flex flex-wrap gap-2" @submit.prevent="runSearch">
        <Input
          v-model="keyword"
          class="min-w-0 flex-1 basis-40"
          placeholder="搜索标题或标签，例如 language:chinese"
          aria-label="搜索图集"
        />
        <Button type="submit">
          <SearchIcon />
          搜索
        </Button>
        <CategoryFilter :selected="selected" @apply="applyCategories" />
      </form>
      <div class="flex flex-col gap-2" aria-label="搜索历史">
        <div class="text-muted-foreground flex items-center justify-between text-xs">
          <span>搜索历史</span>
          <ConfirmDialog
            v-if="entries.length"
            title="清空搜索历史？"
            description="清空后无法恢复，确定要删除全部搜索历史吗？"
            confirm-text="清空历史"
            @confirm="clear"
          >
            <Button variant="ghost" size="xs" class="cursor-pointer" type="button">清空</Button>
          </ConfirmDialog>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <Badge
            v-for="entry in entries"
            :key="entry"
            as="span"
            variant="secondary"
            class="h-auto max-w-full gap-0 rounded-md p-0"
          >
            <Button
              variant="ghost"
              size="xs"
              class="min-w-0 shrink cursor-pointer rounded-r-none"
              type="button"
              :title="entry"
              @click="searchHistory(entry)"
            >
              <span class="truncate">{{ entry }}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              class="cursor-pointer rounded-l-none"
              :aria-label="`删除历史：${entry}`"
              type="button"
              @click="remove(entry)"
            >
              <XIcon class="size-3" />
            </Button>
          </Badge>
          <EmptyState v-if="!entries.length" compact message="暂无搜索历史" />
        </div>
      </div>
    </div>
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
      <EmptyState v-if="!loading && !errorMessage && items.length === 0" message="没有找到符合条件的图集。" />
      <p v-if="!hasMore && !errorMessage && items.length > 0" class="text-muted-foreground py-6 text-center text-sm">
        已经到底了。
      </p>
    </div>
  </div>
</template>
