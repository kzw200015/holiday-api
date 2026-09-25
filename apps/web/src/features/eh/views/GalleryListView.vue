<script setup lang="ts">
import { Skeleton } from "@/components/ui/skeleton"
import GalleryRow from "@/features/eh/components/GalleryRow.vue"
import GallerySearchForm from "@/features/eh/components/GallerySearchForm.vue"
import { useGallerySearch } from "@/features/eh/composables/useGallerySearch"
import EmptyState from "@/shared/components/EmptyState.vue"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"

const {
  keyword,
  items,
  loading,
  errorMessage,
  hasMore,
  preferences,
  history,
  submit,
  applyFilters,
  selectHistory,
  retry,
} = useGallerySearch()
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <GallerySearchForm
      v-model:keyword="keyword"
      :filters="preferences.filters"
      :history="history.entries"
      @submit="submit"
      @apply-filters="applyFilters"
      @select-history="selectHistory"
      @remove-history="history.remove"
      @clear-history="history.clear"
    />
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
