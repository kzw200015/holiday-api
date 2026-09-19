import { useInfiniteScroll } from "@vueuse/core"
import { computed, onActivated, onDeactivated, onScopeDispose, reactive, ref, shallowRef, triggerRef } from "vue"

import { searchGalleries, type GalleryCard, type GallerySearch } from "@/api/eh"
import { useAsyncAction } from "@/composables/useAsyncAction"
import { useGalleryPreferences } from "@/composables/useGalleryPreferences"
import { usePageScroll } from "@/composables/usePageScroll"
import { useSearchHistory } from "@/composables/useSearchHistory"

/** 草稿、已提交条件、远端偏好和分页在同一个页面作用域内协调。 */
export function useGallerySearch() {
  const keyword = ref("")
  const query = shallowRef<GallerySearch | null>(null)
  const items = shallowRef<GalleryCard[]>([])
  const cursor = ref<string | null>(null)
  const active = ref(true)
  const preferences = reactive(useGalleryPreferences())
  const history = reactive(useSearchHistory())
  const resetScroll = usePageScroll()
  /* 翻页请求同一时刻只该有一个：换条件时旧的那页结果已经没有意义。 */
  const paging = useAsyncAction({ latestOnly: true })
  let activation = 0

  function search(next: GallerySearch) {
    const categories = [...new Set(next.categories)].sort()
    if (query.value?.keyword === next.keyword && query.value.categories.join(",") === categories.join(",")) {
      return
    }
    paging.cancel()
    paging.clearError()
    query.value = { keyword: next.keyword, categories }
    items.value = []
    cursor.value = ""
    void loadMore()
  }

  function loadMore() {
    const current = query.value
    const from = cursor.value
    /* 上一页还在路上、已经到底、或者上一次就失败了（等用户点重试），都不再自动往下取。 */
    if (!current || from === null || paging.pending.value || paging.errorMessage.value) {
      return
    }
    return paging.run((signal) => searchGalleries({ ...current, cursor: from }, signal), {
      apply: (result) => {
        items.value.push(...result.items)
        triggerRef(items)
        cursor.value = result.nextCursor
      },
    })
  }

  function submit() {
    keyword.value = keyword.value.trim()
    search({ keyword: keyword.value, categories: preferences.categories })
    if (keyword.value) {
      void history.record(keyword.value)
    }
    void resetScroll()
  }

  function applyCategories(categories: string[]) {
    void preferences.applyCategories(categories)
    submit()
  }

  function selectHistory(entry: string) {
    keyword.value = entry
    submit()
  }

  function retry() {
    paging.clearError()
    void loadMore()
  }

  onActivated(async () => {
    active.value = true
    const current = ++activation
    void history.load()
    await preferences.load()
    if (!active.value || current !== activation) {
      return
    }
    /* 更新远端分类时沿用已提交关键词，草稿和未变化的列表位置保持原样。 */
    const previousCategories = query.value?.categories.join(",") ?? ""
    search({ keyword: query.value?.keyword ?? "", categories: preferences.categories })
    if (previousCategories !== query.value?.categories.join(",")) {
      void resetScroll()
    }
  })
  onDeactivated(() => {
    active.value = false
  })
  onScopeDispose(() => {
    active.value = false
  })

  const hasMore = computed(() => cursor.value !== null)
  useInfiniteScroll(
    () => (active.value ? window : null),
    () => void loadMore(),
    {
      distance: 600,
      canLoadMore: () => hasMore.value && !paging.pending.value && !paging.errorMessage.value,
    },
  )

  return {
    keyword,
    query,
    items,
    loading: paging.pending,
    errorMessage: paging.errorMessage,
    hasMore,
    preferences,
    history,
    submit,
    applyCategories,
    selectHistory,
    retry,
  }
}
