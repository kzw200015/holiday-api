import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/vue-query"
import { useInfiniteScroll } from "@vueuse/core"
import { computed, onActivated, onDeactivated, ref } from "vue"

import { clearReadingHistory, fetchReadingHistory, removeReadingHistory } from "@/features/eh/api"
import { ehKeys } from "@/features/eh/keys"
import type { GalleryDetailResult, ReadingHistoryItem, ReadingHistoryPage } from "@/features/eh/model"
import { usePageScroll } from "@/shared/composables/usePageScroll"

type HistoryCache = InfiniteData<ReadingHistoryPage, string>

/*
 * 删掉记录的同时把那本图集详情里的进度抹掉。
 *
 * 详情缓存里还留着删之前的页码，不改它的话重进详情会显示「继续阅读第 N 页」，
 * 而服务端那边这条已经没了。
 */
function forgetProgress(detail: GalleryDetailResult | undefined) {
  return detail && detail.progress !== null ? { ...detail, progress: null } : detail
}

/**
 * 阅读历史的加载与增删。
 *
 * 分页方式和图集搜索一致：只往后触底加载，不做上一页下一页。游标分页本来只给「下一页从哪开始」，
 * 硬要往回翻就得自己记住每页的起点，还得处理「删掉末页最后一条」这类边角；单向加载没有这些。
 *
 * 删除和清空直接改缓存里的列表，不重新拉页：游标按阅读时间取，删掉一条不会影响后面几页的起点。
 */
export function useReadingHistory() {
  const queryClient = useQueryClient()
  const resetScroll = usePageScroll()
  /* 页面被缓存起来时不再滚动、也不再自动补页，但已发出的删除仍要跑完。 */
  const active = ref(true)

  const history = useInfiniteQuery({
    queryKey: ehKeys.history,
    queryFn: ({ pageParam, signal }) => fetchReadingHistory(pageParam, signal),
    initialPageParam: "",
    getNextPageParam: (page: ReadingHistoryPage) => page.nextCursor,
    /* 读完一本回到这里，它就该排在最前面、页码也对得上，所以不留新鲜期。 */
    staleTime: 0,
  })
  const items = computed(() => history.data.value?.pages.flatMap((page) => page.items) ?? [])

  function dropFromCache(gid: number) {
    queryClient.setQueryData<HistoryCache>(ehKeys.history, (cache) =>
      cache
        ? {
            ...cache,
            pages: cache.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.gid !== gid) })),
          }
        : cache,
    )
  }

  /* 删除要给回执：用户看着那一条消失，所以这两个等结果，失败了照样提示。 */
  const removing = useMutation({
    mutationFn: (item: ReadingHistoryItem) => removeReadingHistory(item.gid),
    onSuccess: (_result, item) => {
      queryClient.setQueryData<GalleryDetailResult>(ehKeys.gallery(item.gid, item.token), forgetProgress)
      dropFromCache(item.gid)
    },
  })
  const clearing = useMutation({
    mutationFn: () => clearReadingHistory(),
    onSuccess: () => {
      queryClient.setQueriesData<GalleryDetailResult>({ queryKey: ehKeys.galleryDetails }, forgetProgress)
      queryClient.setQueryData<HistoryCache>(ehKeys.history, {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [""],
      })
      if (active.value) {
        void resetScroll()
      }
    },
  })

  /* 读和写都会改动列表，谁在跑都不该再接第二个操作。 */
  const busy = computed(() => history.isFetching.value || removing.isPending.value || clearing.isPending.value)

  async function refresh() {
    await history.refetch()
    if (active.value) {
      void resetScroll()
    }
  }

  /* 保留滚动位置，但重新读取，以反映本次阅读及其他设备的修改。 */
  onActivated(() => {
    active.value = true
    if (!busy.value) {
      void history.refetch()
    }
  })
  onDeactivated(() => {
    active.value = false
  })

  /* 删除在途时也不续取：续取写回的是它开始时拿到的列表，刚删掉的那条会跟着回来。 */
  useInfiniteScroll(
    () => (active.value ? window : null),
    () => void history.fetchNextPage(),
    { distance: 600, canLoadMore: () => history.hasNextPage.value && !busy.value && !history.error.value },
  )

  return {
    items,
    loading: history.isPending,
    loadingMore: history.isFetchingNextPage,
    hasMore: history.hasNextPage,
    busy,
    loadError: computed(() => history.error.value?.message ?? ""),
    changeError: computed(() => removing.error.value?.message ?? clearing.error.value?.message ?? ""),
    refresh,
    remove: (item: ReadingHistoryItem) => removing.mutate(item),
    clear: () => clearing.mutate(),
    retry: () => void history.refetch(),
  }
}
