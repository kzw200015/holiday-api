import type { CursorPage, GalleryCard, GalleryCategory } from "@myapi/shared/eh"
import { useInfiniteQuery, useQueryCache } from "@pinia/colada"
import { computed, reactive, ref, shallowRef } from "vue"

import { searchGalleries } from "@/features/eh/api"
import { normalizeCategories, useGalleryPreferences } from "@/features/eh/composables/useGalleryPreferences"
import { useSearchHistory } from "@/features/eh/composables/useSearchHistory"
import { ehKeys } from "@/features/eh/queries"
import { keepFirstPage } from "@/shared/api/queries"
import { useInfiniteLoad } from "@/shared/composables/useInfiniteLoad"
import { usePageScroll } from "@/shared/composables/usePageScroll"

/** 草稿、已提交条件与分页在同一个页面作用域内协调。 */
export function useGallerySearch() {
  const queryCache = useQueryCache()
  const keyword = ref("")
  const preferences = reactive(useGalleryPreferences())
  const history = reactive(useSearchHistory())
  const resetScroll = usePageScroll()
  /*
   * 已提交的条件：关键词已去两端空白，分类已去重排序。
   * 偏好进页面前就备齐了，首次条件当场定得下来，不必先挂一个「还不能查」的状态等它。
   */
  const submitted = shallowRef({ keyword: "", categories: normalizeCategories(preferences.categories) })
  const key = () => ehKeys.search(submitted.value.keyword, submitted.value.categories)

  /* 每组条件一条缓存，查询函数用的是这组条件自己，而不是查询发出时 submitted 的值。 */
  const search = useInfiniteQuery(() => {
    const criteria = submitted.value
    return {
      key: ehKeys.search(criteria.keyword, criteria.categories),
      query: ({ pageParam, signal }) => searchGalleries({ ...criteria, cursor: pageParam }, signal),
      initialPageParam: "",
      getNextPageParam: (last: CursorPage<GalleryCard>) => last.nextCursor,
    }
  })

  /* 分类由调用方给：刚应用的那组直接传进来，不指望它此刻已经落进偏好。 */
  function submit(categories: GalleryCategory[] = preferences.categories) {
    keyword.value = keyword.value.trim()
    /* 旧条件还在途的那次不必等了：上游一页要好几秒，换了条件它的结果也不再显示。 */
    queryCache.cancelQueries({ key: ehKeys.searches })
    submitted.value = { keyword: keyword.value, categories: normalizeCategories(categories) }
    /* 列表按时间倒序，重按搜索就是想看有没有新的：哪怕条件没变、缓存里有这组条件翻过的页，也只留第一页重读。 */
    keepFirstPage(queryCache, { key: key(), exact: true })
    void search.refetch()
    if (keyword.value) {
      history.record(keyword.value)
    }
    void resetScroll()
  }

  function applyCategories(categories: GalleryCategory[]) {
    preferences.applyCategories(categories)
    submit(categories)
  }

  function selectHistory(entry: string) {
    keyword.value = entry
    submit()
  }

  const loadNext = () => void search.loadNextPage()
  useInfiniteLoad(loadNext, () => search.hasNextPage.value && !search.isLoading.value && !search.error.value)

  return {
    keyword,
    items: computed(() => search.data.value?.pages.flatMap((page) => page.items) ?? []),
    loading: search.isLoading,
    errorMessage: computed(() => search.error.value?.message ?? ""),
    hasMore: search.hasNextPage,
    preferences,
    history,
    submit: () => submit(),
    applyCategories,
    selectHistory,
    /* 一页都没有就重读第一页，否则重试失败的那一页。 */
    retry: () => (search.data.value ? loadNext() : void search.refetch()),
  }
}
