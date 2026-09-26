import { useInfiniteQuery, useMutation, useQueryCache, type UseInfiniteQueryData } from "@pinia/colada"
import { computed, ref } from "vue"

import { clearReadingHistory, fetchReadingHistory, removeReadingHistory } from "@/features/eh/api"
import { ehKeys, useEhWrites } from "@/features/eh/queries"
import { useInfiniteLoad } from "@/shared/composables/useInfiniteLoad"
import { usePageScroll } from "@/shared/composables/usePageScroll"
import { useRefreshOnActivated } from "@/shared/composables/useRefreshOnActivated"

type HistoryPage = Awaited<ReturnType<typeof fetchReadingHistory>>
type HistoryPages = UseInfiniteQueryData<HistoryPage, string>

interface Change {
  send: () => Promise<unknown>
  /** 成功后改本地：删掉的不再显示，对应的进度一并抹掉 */
  apply: () => void
}

/**
 * 阅读历史的加载与增删。
 *
 * 分页方式和图集搜索一致：只往后触底加载，不做上一页下一页。页面被 KeepAlive 留着，每次回来都重读已加载的这几页，
 * 保留滚动位置，以反映本次阅读及其他设备的修改。删除直接改本地的列表，不重新拉页：游标按阅读时间取，
 * 删掉一条不会影响后面几页的起点。
 */
export function useReadingHistory() {
  const queryCache = useQueryCache()
  const writes = useEhWrites()
  const resetScroll = usePageScroll()

  const history = useInfiniteQuery({
    key: ehKeys.history,
    /*
     * 先等已经发出的写入落地：每条记录都带着读到第几页，刚退出阅读时读回来的会是上报之前的页码；
     * 删除还在跑时读回来的也还带着正要删掉的那条。
     */
    query: async ({ pageParam, signal }) => {
      await writes.settled()
      return fetchReadingHistory(pageParam, signal)
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
  })
  /* 正在续取下一页；与重读区分开，刷新时列表底部不冒出续取的骨架屏。 */
  const loadingMore = ref(false)

  async function loadMore() {
    loadingMore.value = true
    try {
      await history.loadNextPage()
    } finally {
      loadingMore.value = false
    }
  }

  /* 删除要给回执：用户看着那一条消失，所以等结果，失败了照样提示。一次只会有一个在跑，共用一处提示。 */
  const change = useMutation({
    mutation: ({ send }: Change) => writes.track(send()),
    onSuccess: (_result, { apply }) => apply(),
  })

  function updatePages(update: (pages: HistoryPages) => HistoryPages) {
    const current = queryCache.getQueryData<HistoryPages>(ehKeys.history)
    if (current) {
      queryCache.setQueryData(ehKeys.history, update(current))
    }
  }

  function remove(item: HistoryPage["items"][number]) {
    change.mutate({
      send: () => removeReadingHistory(item.gid),
      apply: () => {
        /* 在途的读取带回的是删除之前的页码，先取消，否则重进详情又冒出一个服务端已经没有的「继续阅读」。 */
        queryCache.cancelQueries({ key: ehKeys.progress(item.gid), exact: true })
        queryCache.setQueryData(ehKeys.progress(item.gid), null)
        updatePages((data) => ({
          ...data,
          pages: data.pages.map((page) => ({ ...page, items: page.items.filter((entry) => entry.gid !== item.gid) })),
        }))
      },
    })
  }

  function clear() {
    change.mutate({
      send: clearReadingHistory,
      apply: () => {
        queryCache.cancelQueries({ key: ehKeys.progresses })
        queryCache.setQueriesData({ key: ehKeys.progresses }, () => null)
        /* 本地先清空当场生效，再重读一次：「后面还有没有」是随页算的，只有重读才会跟着变成没有。 */
        updatePages(() => ({ pages: [{ items: [], nextCursor: null }], pageParams: [""] }))
        void history.refetch()
        if (active.value) {
          void resetScroll()
        }
      },
    })
  }

  /* 读和写都会改动列表，谁在跑都不该再接第二个操作。 */
  const busy = computed(() => history.isLoading.value || change.isLoading.value)
  /* 忙着的时候不续取；续取失败后也不自己往下取，等用户点重试。页面被缓存起来时不再滚动，但已发出的删除仍要跑完。 */
  const active = useInfiniteLoad(
    () => void loadMore(),
    () => history.hasNextPage.value && !busy.value && !history.error.value,
  )

  async function refresh() {
    await history.refetch()
    if (active.value) {
      void resetScroll()
    }
  }

  useRefreshOnActivated(() => history.refresh())

  return {
    items: computed(() => history.data.value?.pages.flatMap((page) => page.items) ?? []),
    loading: computed(() => history.data.value === undefined && history.error.value === null),
    loadingMore,
    hasMore: history.hasNextPage,
    busy,
    loadError: computed(() => history.error.value?.message ?? ""),
    changeError: computed(() => change.error.value?.message ?? ""),
    refresh,
    remove,
    clear,
    /* 把已经加载的这几页从头重读，读完再接着往下取。 */
    retry: () => void history.refetch(),
  }
}
