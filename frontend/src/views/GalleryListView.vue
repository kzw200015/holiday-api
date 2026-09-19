<script setup lang="ts">
import EmptyState from "@/components/EmptyState.vue"
import ErrorAlert from "@/components/ErrorAlert.vue"
import GalleryRow from "@/components/gallery/GalleryRow.vue"
import GallerySearchForm from "@/components/gallery/GallerySearchForm.vue"
import { Skeleton } from "@/components/ui/skeleton"
import { useGallerySearch } from "@/composables/useGallerySearch"

const {
  keyword,
  query,
  items,
  loading,
  errorMessage,
  hasMore,
  preferences,
  history,
  submit,
  applyCategories,
  selectHistory,
  retry,
} = useGallerySearch()
</script>

<template>
  <div class="page-content flex flex-col gap-4">
    <GallerySearchForm
      v-model:keyword="keyword"
      :categories="preferences.categories"
      :disabled="preferences.loading || preferences.saving"
      :preferences-error="preferences.errorMessage"
      :history="history"
      @submit="submit"
      @apply-categories="applyCategories"
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
      <EmptyState v-if="query && !loading && !errorMessage && items.length === 0" message="没有找到符合条件的图集。" />
      <p v-if="!hasMore && !errorMessage && items.length > 0" class="text-muted-foreground py-6 text-center text-sm">
        已经到底了。
      </p>
    </div>
  </div>
</template>
