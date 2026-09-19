import { useInfiniteQuery, useQueryClient } from "@tanstack/vue-query"
import { useInfiniteScroll } from "@vueuse/core"
import { computed, onActivated, onDeactivated, onScopeDispose, reactive, ref, shallowRef } from "vue"

import { ehKeys, searchGalleries, type GalleryPage, type GallerySearch } from "@/api/eh"
import { CONTENT_STALE_TIME } from "@/api/queryClient"
import { useGalleryPreferences } from "@/composables/useGalleryPreferences"
import { usePageScroll } from "@/composables/usePageScroll"
import { useSearchHistory } from "@/composables/useSearchHistory"

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
   * 条件变了就是换查询键，缓存里有就直接显示、没有才请求。条件没变时只有两种情况要重来一次：
   * 用户自己按了搜索（列表按时间倒序，重按就是想看有没有新的），以及上一次失败了——
   * 否则同一个关键词重按搜索、甚至离开页面再回来，都不会有任何反应。
   */
  function restart(next: GallerySearch, force: boolean) {
    const normalized = normalize(next)
    const changed = !sameSearch(query.value, normalized)
    query.value = normalized
    if (!changed && (force || paging.isError.value)) {
      void queryClient.resetQueries({ queryKey: ehKeys.galleries(normalized) })
    }
    return changed
  }

  function loadMore() {
    if (paging.hasNextPage.value && !paging.isFetching.value && !paging.isError.value) {
      void paging.fetchNextPage()
    }
  }

  function submit() {
    keyword.value = keyword.value.trim()
    restart({ keyword: keyword.value, categories: preferences.categories }, true)
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
    if (restart({ keyword: query.value?.keyword ?? "", categories: preferences.categories }, false)) {
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
