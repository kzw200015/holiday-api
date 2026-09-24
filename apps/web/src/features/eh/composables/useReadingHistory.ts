import type { ReadingHistoryItem } from "@myapi/shared"
import { computed, onActivated, ref, watch } from "vue"

import { clearReadingHistory, fetchReadingHistory, removeReadingHistory } from "@/features/eh/api"
import { useGalleryContentStore } from "@/features/eh/store"
import { useCursorPages } from "@/shared/composables/useCursorPages"
import { useInfiniteLoad } from "@/shared/composables/useInfiniteLoad"
import { usePageScroll } from "@/shared/composables/usePageScroll"
import { toError } from "@/shared/lib/errors"

/**
 * 阅读历史的加载与增删。
 *
 * 分页方式和图集搜索一致：只往后触底加载，不做上一页下一页。
 * 删除和清空直接改本地的列表，不重新拉页：游标按阅读时间取，删掉一条不会影响后面几页的起点。
 */
export function useReadingHistory() {
  const content = useGalleryContentStore()
  const resetScroll = usePageScroll()

  /* 每条记录都带着读到第几页：先等已经发出的进度保存落地，否则刚退出阅读时读回来的还是上报之前的页码，
   * 点「继续阅读」就会把进度按回去。保存有时限，等不了太久。 */
  const history = useCursorPages(async (cursor, signal) => {
    await content.progressSaved()
    return fetchReadingHistory(cursor, signal)
  })
  /* 在 setup 里当场发出：KeepAlive 首次挂载也会触发 onActivated，靠 busy 挡住那里的第二次请求。 */
  history.restart()
  /* 每条记录都带着 e 站的图集元数据，换绑 e 站账号后可见性跟着变，所以同样从头读。 */
  watch(
    () => content.revision,
    () => history.restart(),
  )

  /* 删除要给回执：用户看着那一条消失，所以这两个等结果，失败了照样提示。一次只会有一个在跑，共用一处提示。 */
  const changing = ref(false)
  const changeError = ref("")

  async function change(request: () => Promise<unknown>, apply: () => void) {
    changing.value = true
    changeError.value = ""
    try {
      await request()
      apply()
    } catch (error) {
      changeError.value = toError(error).message
    } finally {
      changing.value = false
    }
  }

  /* 删掉记录的同时把那本图集详情里的进度抹掉，否则重进详情会显示一个服务端已经没有的页码。 */
  function remove(item: ReadingHistoryItem) {
    void change(
      () => removeReadingHistory(item.gid),
      () => {
        content.setProgress(item.gid, item.token, null)
        history.update((pages) =>
          pages.map((page) => ({ ...page, items: page.items.filter((entry) => entry.gid !== item.gid) })),
        )
      },
    )
  }

  function clear() {
    void change(clearReadingHistory, () => {
      content.forgetAllProgress()
      history.update(() => [{ items: [], nextCursor: null }])
      if (active.value) {
        void resetScroll()
      }
    })
  }

  /* 读和写都会改动列表，谁在跑都不该再接第二个操作。 */
  const busy = computed(() => history.pending.value || changing.value)
  /* 忙着的时候不续取；续取失败后也不自己往下取，等用户点重试。页面被缓存起来时不再滚动，但已发出的删除仍要跑完。 */
  const active = useInfiniteLoad(history.fetchNext, () => history.hasMore.value && !busy.value && !history.error.value)

  async function refresh() {
    await history.refetch()
    if (active.value) {
      void resetScroll()
    }
  }

  /* 保留滚动位置，但重新读取，以反映本次阅读及其他设备的修改。 */
  onActivated(() => {
    if (!busy.value) {
      void history.refetch()
    }
  })

  return {
    items: history.items,
    loading: history.loading,
    loadingMore: history.loadingMore,
    hasMore: history.hasMore,
    busy,
    loadError: computed(() => history.error.value?.message ?? ""),
    changeError,
    refresh,
    remove,
    clear,
    retry: () => void history.refetch(),
  }
}
