<script setup lang="ts">
import { SearchIcon, XIcon } from "@lucide/vue"
import { useInfiniteScroll } from "@vueuse/core"
import { onActivated, onDeactivated, onMounted, onScopeDispose, ref } from "vue"

import ConfirmDialog from "@/components/ConfirmDialog.vue"
import EmptyState from "@/components/EmptyState.vue"
import ErrorAlert from "@/components/ErrorAlert.vue"
import CategoryFilter from "@/components/gallery/CategoryFilter.vue"
import GalleryRow from "@/components/gallery/GalleryRow.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useGalleryList } from "@/composables/useGalleryList"
import { useGalleryPreferences } from "@/composables/useGalleryPreferences"
import { usePageScroll } from "@/composables/usePageScroll"
import { useSearchHistory } from "@/composables/useSearchHistory"

const { items, loading, errorMessage, hasMore, search, loadMore, retry } = useGalleryList()
const {
  entries,
  loading: historyLoading,
  errorMessage: historyError,
  load: loadHistory,
  record,
  remove,
  clear,
} = useSearchHistory()
const {
  categories: selected,
  loading: preferencesLoading,
  savingCategories,
  errorMessage: preferencesError,
  load: loadPreferences,
  applyCategories: apply,
} = useGalleryPreferences()
const active = ref(true)
const resetScroll = usePageScroll()
const keyword = ref("")
let submittedKeyword = ""
let initialized = false

async function refreshPreferences() {
  void loadHistory()
  const previousCategories = [...selected.value].sort().join(",")
  await loadPreferences()
  initialized = true
  if (!active.value || preferencesLoading.value) {
    return
  }
  /* 分类没变时 search 保留来源列表和游标；草稿关键词不参与恢复查询。 */
  void search({ keyword: submittedKeyword, categories: selected.value })
  if (previousCategories !== [...selected.value].sort().join(",")) {
    void resetScroll()
  }
}

onMounted(refreshPreferences)
onActivated(() => {
  active.value = true
  if (initialized) {
    void refreshPreferences()
  }
})
onDeactivated(() => {
  active.value = false
})
onScopeDispose(() => {
  active.value = false
})

function runSearch() {
  keyword.value = keyword.value.trim()
  submittedKeyword = keyword.value
  void record(keyword.value)
  void search({ keyword: keyword.value, categories: selected.value })
  void resetScroll()
}

function applyCategories(categories: string[]) {
  void apply(categories)
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
      <form @submit.prevent="runSearch">
        <fieldset class="flex min-w-0 flex-wrap gap-2" :disabled="preferencesLoading || savingCategories">
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
        </fieldset>
      </form>
      <ErrorAlert v-if="preferencesError" :message="preferencesError" title="偏好同步失败" />
      <ErrorAlert v-if="historyError" :message="historyError" title="历史同步失败" />
      <div class="flex flex-col gap-2" aria-label="搜索历史">
        <div class="text-muted-foreground flex items-center justify-between text-xs">
          <span>搜索历史</span>
          <ConfirmDialog
            v-if="entries.length"
            title="清空搜索历史？"
            description="清空会删除此账号在所有设备上共享的搜索历史，且无法恢复。确定继续吗？"
            confirm-text="清空历史"
            @confirm="clear"
          >
            <Button variant="ghost" size="xs" class="cursor-pointer" type="button" :disabled="historyLoading"
              >清空</Button
            >
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
              :disabled="preferencesLoading || savingCategories"
              @click="searchHistory(entry)"
            >
              <span class="truncate">{{ entry }}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              class="cursor-pointer rounded-l-none"
              :aria-label="`删除历史：${entry}`"
              :disabled="historyLoading"
              type="button"
              @click="remove(entry)"
            >
              <XIcon class="size-3" />
            </Button>
          </Badge>
          <span v-if="historyLoading" class="text-muted-foreground text-xs">正在同步搜索历史…</span>
          <EmptyState v-else-if="!entries.length && !historyError" compact message="暂无搜索历史" />
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
      <EmptyState
        v-if="!preferencesLoading && !loading && !errorMessage && items.length === 0"
        message="没有找到符合条件的图集。"
      />
      <p v-if="!hasMore && !errorMessage && items.length > 0" class="text-muted-foreground py-6 text-center text-sm">
        已经到底了。
      </p>
    </div>
  </div>
</template>
