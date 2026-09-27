import { useInfiniteQuery } from "@pinia/colada"
import { storeToRefs } from "pinia"
import { computed } from "vue"

import { searchGalleries, type GallerySearchPage } from "@/features/eh/api"
import { useGalleryPreferences, type GalleryFilters } from "@/features/eh/composables/useGalleryPreferences"
import { useGallerySearchStore } from "@/features/eh/composables/useGallerySearchStore"
import { useSearchHistory } from "@/features/eh/composables/useSearchHistory"
import { ehKeys } from "@/features/eh/queries"
import { useInfiniteLoad } from "@/shared/composables/useInfiniteLoad"
import { usePageScroll } from "@/shared/composables/usePageScroll"

/** 搜索页：按 store 里的条件取结果、分页与滚动；在这里提交的词记进搜索历史。 */
export function useGallerySearch() {
  const store = useGallerySearchStore()
  const { draft } = storeToRefs(store)
  const preferences = useGalleryPreferences()
  const history = useSearchHistory()
  /* 每提交一次都回到顶部，不论是在这里提交的，还是详情页点标签提交的（那时这一页停用着，回来才滚）。 */
  usePageScroll(() => store.submitted)

  /* 每组条件一条缓存，查询函数用的是这组条件自己，而不是查询发出时 store 里的值。 */
  const search = useInfiniteQuery(() => {
    const criteria = store.current()
    return {
      key: ehKeys.search(criteria),
      query: ({ pageParam, signal }) => searchGalleries({ ...criteria, cursor: pageParam }, signal),
      initialPageParam: "",
      getNextPageParam: (last: GallerySearchPage) => last.nextCursor,
    }
  })

  /* 筛选条件由调用方给：刚应用的那组直接传进来，不指望它此刻已经落进偏好。 */
  function submit(filters?: GalleryFilters) {
    const { keyword } = store.submit({ filters })
    /* 只记在这里提交的词：详情页点标签、上传者是顺着图集在浏览，不是用户自己要搜的词 */
    if (keyword) {
      history.record(keyword)
    }
  }

  function applyFilters(filters: GalleryFilters) {
    preferences.applyFilters(filters)
    submit(filters)
  }

  function selectHistory(entry: string) {
    draft.value = entry
    submit()
  }

  const loadNext = () => void search.loadNextPage()
  useInfiniteLoad(loadNext, () => search.hasNextPage.value && !search.isLoading.value && !search.error.value)

  return {
    keyword: draft,
    items: computed(() => search.data.value?.pages.flatMap((page) => page.items) ?? []),
    loading: search.isLoading,
    errorMessage: computed(() => search.error.value?.message ?? ""),
    hasMore: search.hasNextPage,
    filters: preferences.filters,
    history: history.entries,
    removeHistory: history.remove,
    clearHistory: history.clear,
    submit: () => submit(),
    applyFilters,
    selectHistory,
    /* 一页都没有就重读第一页，否则重试失败的那一页。 */
    retry: () => (search.data.value ? loadNext() : void search.refetch()),
  }
}
