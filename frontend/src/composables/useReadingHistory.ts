import { computed, onActivated, onDeactivated, ref, shallowRef } from "vue"

import type { ReadingHistoryItem } from "@/api/eh"
import { useAsyncAction } from "@/composables/useAsyncAction"
import { usePageScroll } from "@/composables/usePageScroll"
import { useEhStore } from "@/stores/EhStore"

/**
 * 阅读历史的翻页与增删。
 *
 * 后端按游标分页，只给「下一页从哪儿开始」，所以这里把走过的每页起点按顺序记下来，
 * 才能往回翻。读取和增删分成两个操作：删一条之后要重新取当前页补齐，两件事的
 * 进行中状态和失败提示都是分开的，界面上也是分开的两块。
 */
export function useReadingHistory() {
  const store = useEhStore()
  const items = shallowRef<ReadingHistoryItem[]>([])
  /* cursors[i] 是第 i 页的起始游标，第一页固定是空串；长度即已知的页数。 */
  const cursors = ref([""])
  const pageIndex = ref(0)
  const resetScroll = usePageScroll()
  const loading = useAsyncAction({ latestOnly: true })
  const changing = useAsyncAction()
  /* 「正忙」只算这一处：读和写都会改动列表，谁在跑都不该再接第二个操作。 */
  const busy = computed(() => loading.pending.value || changing.pending.value)
  let requestedPage = 0
  /* 页面被缓存起来时不再滚动、也不再自动补页，但已发出的删除仍要跑完。 */
  let active = false

  function load(index = pageIndex.value, resetPosition = false) {
    requestedPage = index
    return loading.run((signal) => store.loadReadingHistory(cursors.value[index] ?? "", signal), {
      apply: (result) => {
        items.value = result.items
        pageIndex.value = index
        cursors.value = cursors.value.slice(0, index + 1)
        if (result.nextCursor !== null) {
          cursors.value.push(result.nextCursor)
        }
        if (resetPosition) {
          void resetScroll()
        }
      },
    })
  }

  async function remove(gid: number) {
    if (busy.value) {
      return
    }
    const removed = await changing.run(() => store.removeReadingHistory(gid), {
      apply: () => {
        items.value = items.value.filter((item) => item.gid !== gid)
      },
    })
    /* 删除末页最后一条时回到上一页，其余情况补齐当前页。 */
    if (removed && active) {
      await load(items.value.length === 0 ? Math.max(0, pageIndex.value - 1) : pageIndex.value)
    }
  }

  async function clear() {
    if (busy.value) {
      return
    }
    await changing.run(() => store.clearReadingHistory(), {
      apply: () => {
        items.value = []
        cursors.value = [""]
        pageIndex.value = 0
        loading.clearError()
        if (active) {
          void resetScroll()
        }
      },
    })
  }

  /* 保留当前页与滚动位置，但重新读取进度，以反映本次阅读及其他设备的修改。 */
  onActivated(() => {
    active = true
    if (!changing.pending.value) {
      void load()
    }
  })
  onDeactivated(() => {
    active = false
    loading.cancel()
  })

  return {
    items,
    pageIndex,
    loading: loading.pending,
    busy,
    loadError: loading.errorMessage,
    changeError: changing.errorMessage,
    hasPrevious: computed(() => pageIndex.value > 0),
    hasNext: computed(() => pageIndex.value + 1 < cursors.value.length),
    load,
    remove,
    clear,
    retry: () => load(requestedPage),
  }
}
