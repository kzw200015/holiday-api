import { defineStore } from "pinia"
import { onScopeDispose, ref, watch } from "vue"

import * as ehApi from "@/api/eh"
import { useSerialQueue } from "@/composables/useSerialQueue"
import { useAuthStore } from "@/stores/AuthStore"

export interface ReadingPosition {
  gid: number
  token: string
  page: number
}

/* 列表保留展示信息，页码统一从 Store 的 readingProgress 读取。 */
export type ReadingHistoryEntry = Omit<ehApi.ReadingHistoryItem, "page">

export const useEhStore = defineStore("EhStore", () => {
  const authStore = useAuthStore()
  const cacheRevision = ref(0)
  /* 与后端一样按 gid 识别进度；只存已查询到或已保存成功的页码。 */
  const readingProgress = ref(new Map<number, number | null>())
  const readingQueue = useSerialQueue()
  const searchHistory = ref<string[]>([])
  const searchQueue = useSerialQueue()
  const saveTimers = new Map<number, ReturnType<typeof setTimeout>>()

  /* 凭据变化只淘汰 EH 页面，账号级的阅读进度不因换绑 e 站账号而清空。 */
  function invalidateCache() {
    cacheRevision.value += 1
  }

  /* 详情接口包含进度，也参与读写排序；页面不再单独持有这份页码。 */
  async function loadGalleryDetail(gid: number, token: string, signal?: AbortSignal) {
    const result = await readingQueue.run(
      (requestSignal) => ehApi.fetchGalleryDetail(gid, token, requestSignal),
      (detail) => readingProgress.value.set(gid, detail.progress),
      signal,
    )
    return { gallery: result.gallery, imageUrlTemplate: result.imageUrlTemplate }
  }

  async function loadReadingHistory(cursor: string, signal?: AbortSignal) {
    const result = await readingQueue.run(
      (requestSignal) => ehApi.fetchReadingHistory(cursor, requestSignal),
      (history) => {
        for (const item of history.items) {
          readingProgress.value.set(item.gid, item.page)
        }
      },
      signal,
    )
    return {
      items: result.items.map(({ gid, token, readAt, gallery }) => ({ gid, token, readAt, gallery })),
      nextCursor: result.nextCursor,
    }
  }

  /* 计时器随 Store 存活，离开阅读器既不提前保存，也不丢弃最后报告的位置。 */
  function scheduleProgress({ gid, token, page }: ReadingPosition) {
    cancelPendingProgress(gid)
    const timer = setTimeout(() => {
      saveTimers.delete(gid)
      /* 保存失败保留上次确认的页码，不打断阅读；之后翻页仍可再次保存。 */
      void readingQueue
        .run(
          (signal) => ehApi.saveProgress(gid, token, page, signal),
          () => readingProgress.value.set(gid, page),
        )
        .catch(() => {})
    }, 1200)
    saveTimers.set(gid, timer)
  }

  function cancelPendingProgress(gid: number) {
    clearTimeout(saveTimers.get(gid))
    saveTimers.delete(gid)
  }

  function cancelPendingSaves() {
    for (const timer of saveTimers.values()) {
      clearTimeout(timer)
    }
    saveTimers.clear()
  }

  function removeReadingHistory(gid: number) {
    cancelPendingProgress(gid)
    return readingQueue.run(
      (signal) => ehApi.removeReadingHistory(gid, signal),
      () => readingProgress.value.delete(gid),
    )
  }

  function clearReadingHistory() {
    cancelPendingSaves()
    return readingQueue.run(
      (signal) => ehApi.clearReadingHistory(signal),
      () => readingProgress.value.clear(),
    )
  }

  /* 搜索历史按账号顺序提交，页面退出后已排队的写入继续执行。 */
  function loadSearchHistory(signal?: AbortSignal) {
    return searchQueue.run(
      (requestSignal) => ehApi.fetchSearchHistory(requestSignal),
      (entries) => {
        searchHistory.value = entries
      },
      signal,
    )
  }

  function recordSearch(keyword: string) {
    return searchQueue.run(
      (signal) => ehApi.recordSearch(keyword, signal),
      (entries) => {
        searchHistory.value = entries
      },
    )
  }

  function removeSearch(keyword: string) {
    return searchQueue.run(
      (signal) => ehApi.removeSearch(keyword, signal),
      (entries) => {
        searchHistory.value = entries
      },
    )
  }

  function clearSearchHistory() {
    return searchQueue.run(
      (signal) => ehApi.clearSearchHistory(signal),
      () => {
        searchHistory.value = []
      },
    )
  }

  function resetSessionState() {
    cancelPendingSaves()
    readingQueue.reset()
    readingProgress.value.clear()
    searchQueue.reset()
    searchHistory.value = []
  }

  /* 队列可能比页面活得久。切换账号时取消旧会话，未发出的操作不能带着新账号令牌执行。 */
  watch([() => authStore.user?.id, () => authStore.pageRevision], resetSessionState, { flush: "sync" })
  onScopeDispose(cancelPendingSaves)

  return {
    cacheRevision,
    readingProgress,
    searchHistory,
    loadSearchHistory,
    recordSearch,
    removeSearch,
    clearSearchHistory,
    invalidateCache,
    loadGalleryDetail,
    loadReadingHistory,
    scheduleProgress,
    removeReadingHistory,
    clearReadingHistory,
  }
})
