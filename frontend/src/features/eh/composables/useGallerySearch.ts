import { useInfiniteQuery, useQueryClient } from "@tanstack/vue-query"
import { useInfiniteScroll } from "@vueuse/core"
import { computed, onActivated, onDeactivated, reactive, ref, shallowRef } from "vue"

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

/** 草稿、已提交条件与分页在同一个页面作用域内协调。 */
export function useGallerySearch() {
  const keyword = ref("")
  const active = ref(true)
  const preferences = reactive(useGalleryPreferences())
  const history = reactive(useSearchHistory())
  const resetScroll = usePageScroll()
  const queryClient = useQueryClient()
  /* 偏好进页面前就备齐了，首次条件当场定得下来，不必先挂一个「还不能查」的状态等它。 */
  const query = shallowRef<GallerySearch>(normalize({ keyword: "", categories: preferences.categories }))

  const paging = useInfiniteQuery({
    queryKey: computed(() => ehKeys.galleries(query.value)),
    queryFn: ({ pageParam, signal }) => searchGalleries({ ...query.value, cursor: pageParam }, signal),
    initialPageParam: "",
    getNextPageParam: (page: GalleryPage) => page.nextCursor,
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
    const changed =
      normalized.keyword !== query.value.keyword || normalized.categories.join(",") !== query.value.categories.join(",")
    query.value = normalized
    return changed
  }

  /* 分类由调用方给：刚应用的那组直接传进来，不指望它此刻已经落进偏好缓存。 */
  function submit(categories: string[] = preferences.categories) {
    keyword.value = keyword.value.trim()
    /* 列表按时间倒序，重按搜索就是想看有没有新的，所以同一组条件也要真的重来一次。 */
    if (!restart({ keyword: keyword.value, categories })) {
      void queryClient.resetQueries({ queryKey: ehKeys.galleries(query.value) })
    }
    if (keyword.value) {
      history.record(keyword.value)
    }
    void resetScroll()
  }

  function applyCategories(categories: string[]) {
    preferences.applyCategories(categories)
    submit(categories)
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

  onActivated(() => {
    active.value = true
  })
  onDeactivated(() => {
    active.value = false
  })

  useInfiniteScroll(
    () => (active.value ? window : null),
    () => void paging.fetchNextPage(),
    { distance: 600, canLoadMore: () => paging.hasNextPage.value && !paging.isFetching.value && !paging.isError.value },
  )

  return {
    keyword,
    items,
    loading: paging.isFetching,
    errorMessage: computed(() => paging.error.value?.message ?? ""),
    hasMore: paging.hasNextPage,
    preferences,
    history,
    submit: () => submit(),
    applyCategories,
    selectHistory,
    retry,
  }
}
