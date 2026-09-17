import { useInfiniteScroll } from "@vueuse/core"
import { computed, onActivated, onDeactivated, onScopeDispose, reactive, ref, shallowRef, triggerRef } from "vue"

import { searchGalleries, type GalleryCard, type GallerySearch } from "@/api/eh"
import { useGalleryPreferences } from "@/composables/useGalleryPreferences"
import { usePageScroll } from "@/composables/usePageScroll"
import { useSearchHistory } from "@/composables/useSearchHistory"

/** 草稿、已提交条件、远端偏好和分页在同一个页面作用域内协调。 */
export function useGallerySearch() {
  const keyword = ref("")
  const query = shallowRef<GallerySearch | null>(null)
  const items = shallowRef<GalleryCard[]>([])
  const cursor = ref<string | null>(null)
  const loading = ref(false)
  const errorMessage = ref("")
  const active = ref(true)
  const preferences = reactive(useGalleryPreferences())
  const history = reactive(useSearchHistory())
  const resetScroll = usePageScroll()
  let request: AbortController | undefined
  let activation = 0

  function search(next: GallerySearch) {
    const categories = [...new Set(next.categories)].sort()
    if (query.value?.keyword === next.keyword && query.value.categories.join(",") === categories.join(",")) {
      return
    }
    request?.abort()
    query.value = { keyword: next.keyword, categories }
    items.value = []
    cursor.value = ""
    loading.value = false
    errorMessage.value = ""
    void loadMore()
  }

  async function loadMore() {
    if (!query.value || loading.value || cursor.value === null || errorMessage.value) {
      return
    }
    const controller = new AbortController()
    request = controller
    loading.value = true
    try {
      const result = await searchGalleries({ ...query.value, cursor: cursor.value }, controller.signal)
      if (!controller.signal.aborted) {
        items.value.push(...result.items)
        triggerRef(items)
        cursor.value = result.nextCursor
      }
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
    errorMessage.value = ""
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
    request?.abort()
  })

  const hasMore = computed(() => cursor.value !== null)
  useInfiniteScroll(() => (active.value ? window : null), loadMore, {
    distance: 600,
    canLoadMore: () => hasMore.value && !loading.value && !errorMessage.value,
  })

  return {
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
  }
}
