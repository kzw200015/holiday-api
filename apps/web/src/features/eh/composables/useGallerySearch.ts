import type { GalleryCategory, gallerySearchSchema } from "@myapi/shared/eh"
import { computed, reactive, ref, watch } from "vue"
import type { z } from "zod"

import { searchGalleries } from "@/features/eh/api"
import { useGalleryPreferences } from "@/features/eh/composables/useGalleryPreferences"
import { useSearchHistory } from "@/features/eh/composables/useSearchHistory"
import { useGalleryContentStore } from "@/features/eh/store"
import { useCursorPages } from "@/shared/composables/useCursorPages"
import { useInfiniteLoad } from "@/shared/composables/useInfiniteLoad"
import { usePageScroll } from "@/shared/composables/usePageScroll"

/** 草稿、已提交条件与分页在同一个页面作用域内协调。 */
export function useGallerySearch() {
  const keyword = ref("")
  const preferences = reactive(useGalleryPreferences())
  const history = reactive(useSearchHistory())
  const content = useGalleryContentStore()
  const resetScroll = usePageScroll()
  /*
   * 已提交的条件：关键词已去两端空白，分类已去重。
   * 偏好进页面前就备齐了，首次条件当场定得下来，不必先挂一个「还不能查」的状态等它。
   */
  let query: z.input<typeof gallerySearchSchema> = { keyword: "", categories: preferences.categories }

  const paging = useCursorPages((cursor, signal) => searchGalleries({ ...query, cursor }, signal))
  paging.restart()
  /* 换绑 e 站账号后能看到的内容变了，停在后台的这一页也从头搜一次。 */
  watch(
    () => content.revision,
    () => paging.restart(),
  )

  /* 分类由调用方给：刚应用的那组直接传进来，不指望它此刻已经落进偏好。 */
  function submit(categories: GalleryCategory[] = preferences.categories) {
    keyword.value = keyword.value.trim()
    /* 列表按时间倒序，重按搜索就是想看有没有新的，所以哪怕条件没变也从第一页重来。 */
    query = { keyword: keyword.value, categories: [...new Set(categories)] }
    paging.restart()
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

  useInfiniteLoad(paging.fetchNext, () => paging.hasMore.value && !paging.pending.value && !paging.error.value)

  return {
    keyword,
    items: paging.items,
    loading: paging.pending,
    errorMessage: computed(() => paging.error.value?.message ?? ""),
    hasMore: paging.hasMore,
    preferences,
    history,
    submit: () => submit(),
    applyCategories,
    selectHistory,
    /* 第一页失败就重取第一页，续取失败则重试那一页，fetchNext 自己分得清。 */
    retry: paging.fetchNext,
  }
}
