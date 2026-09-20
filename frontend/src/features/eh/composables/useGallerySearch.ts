import { useInfiniteQuery, useQueryClient } from "@tanstack/vue-query"
import { useInfiniteScroll } from "@vueuse/core"
import { computed, onActivated, onDeactivated, onScopeDispose, reactive, ref, shallowRef } from "vue"

import { searchGalleries } from "@/features/eh/api"
import { useGalleryPreferences } from "@/features/eh/composables/useGalleryPreferences"
import { useSearchHistory } from "@/features/eh/composables/useSearchHistory"
import { CONTENT_STALE_TIME, ehKeys } from "@/features/eh/keys"
import type { GalleryPage, GallerySearch } from "@/features/eh/model"
import { usePageScroll } from "@/shared/composables/usePageScroll"

/* 同一组条件的两种写法要哈希成同一个键，所以去重加排序。 */
function normalize(search: GallerySearch): GallerySearch {
  return { keyword: search.keyword, categories: [...new Set(search.categories)].sort() }
}

function sameSearch(left: GallerySearch | null, right: GallerySearch) {
  return left?.keyword === right.keyword && left.categories.join(",") === right.categories.join(",")
}

/** 草稿、已提交条件、远端偏好和分页在同一个页面作用域内协调。 */
export function useGallerySearch() {
  const keyword = ref("")
  /* 已提交的条件。它同时是查询键，所以换条件就是换一份数据，旧条件的响应不会再写进来。 */
  const query = shallowRef<GallerySearch | null>(null)
  const active = ref(true)
  const preferences = reactive(useGalleryPreferences())
  const history = reactive(useSearchHistory())
  const resetScroll = usePageScroll()
  const queryClient = useQueryClient()

  const paging = useInfiniteQuery({
    queryKey: computed(() => ehKeys.galleries(query.value ?? { keyword: "", categories: [] })),
    queryFn: ({ pageParam, signal }) => searchGalleries({ ...query.value!, cursor: pageParam }, signal),
    initialPageParam: "",
    getNextPageParam: (page: GalleryPage) => page.nextCursor,
    /* 条件还没确定（首次激活要先读远端分类）时先不查。 */
    enabled: computed(() => query.value !== null),
    staleTime: CONTENT_STALE_TIME,
  })
  const items = computed(() => paging.data.value?.pages.flatMap((page) => page.items) ?? [])

  /**
   * 换一组搜索条件，返回条件是否真的变了。
   *
   * 条件变了就是换查询键，缓存里有就直接显示、没有才请求；条件没变就什么也不发生，
   * 需要「明明一样也再搜一遍」的只有用户按搜索那一种情况，由 submit 自己丢掉缓存。
   */
  function restart(next: GallerySearch) {
    const normalized = normalize(next)
    const changed = !sameSearch(query.value, normalized)
    query.value = normalized
    return changed
  }

  function loadMore() {
    if (paging.hasNextPage.value && !paging.isFetching.value && !paging.isError.value) {
      void paging.fetchNextPage()
    }
  }

  function submit() {
    keyword.value = keyword.value.trim()
    /* 列表按时间倒序，重按搜索就是想看有没有新的，所以同一组条件也要真的重来一次。 */
    if (!restart({ keyword: keyword.value, categories: preferences.categories })) {
      void queryClient.resetQueries({ queryKey: ehKeys.galleries(query.value!) })
    }
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

  /* 第一页失败就重取第一页，续取失败则重试那一页。 */
  function retry() {
    if (items.value.length > 0) {
      void paging.fetchNextPage()
    } else {
      void paging.refetch()
    }
  }

  onActivated(async () => {
    active.value = true
    void history.load()
    await preferences.load()
    if (!active.value) {
      return
    }
    /* 远端分类可能在别的设备上改过：条件跟着变才重新搜，草稿和原有列表位置保持原样。 */
    if (restart({ keyword: query.value?.keyword ?? "", categories: preferences.categories })) {
      void resetScroll()
    }
  })
  onDeactivated(() => {
    active.value = false
  })
  onScopeDispose(() => {
    active.value = false
  })

  useInfiniteScroll(() => (active.value ? window : null), loadMore, {
    distance: 600,
    canLoadMore: () => paging.hasNextPage.value && !paging.isFetching.value && !paging.isError.value,
  })

  return {
    keyword,
    query,
    items,
    loading: paging.isFetching,
    errorMessage: computed(() => paging.error.value?.message ?? ""),
    hasMore: paging.hasNextPage,
    preferences,
    history,
    submit,
    applyCategories,
    selectHistory,
    retry,
  }
}
