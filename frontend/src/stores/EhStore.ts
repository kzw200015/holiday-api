import { defineStore } from "pinia"
import { onScopeDispose, ref, watch, type Ref } from "vue"

import * as ehApi from "@/api/eh"
import { useSerialQueue } from "@/composables/useSerialQueue"
import { useAuthStore } from "@/stores/AuthStore"

export interface ReadingPosition {
  gid: number
  token: string
  page: number
}

/* 提交成功不需要改本地状态时的占位。 */
const noop = () => {}

/* 后端读不到偏好行时也回这个值，两边保持一致。 */
const defaultPreferences = (): ehApi.GalleryPreferences => ({ categories: [], readerInterval: 5 })

export const useEhStore = defineStore("EhStore", () => {
  const authStore = useAuthStore()
  const cacheRevision = ref(0)
  const saveTimers = new Map<number, ReturnType<typeof setTimeout>>()

  /* 切换账号时要清空的那几份状态，由 accountState 自己登记进来。 */
  const sessionResets: (() => void)[] = []

  /**
   * 一块账号级数据：一份状态，加一条把读写按提交顺序排好的队列。
   *
   * 每块都要「换账号时重置队列并恢复初始值」，以前是在 resetSessionState 里逐块手写两行。
   * 漏写一块不会有任何信号，表现是换账号后还能看到上一个账号的数据——上线后才发现、
   * 也很难复现。登记在这里之后，加一块新数据就不可能忘。
   */
  function accountState<T>(initial: () => T) {
    const state = ref(initial()) as Ref<T>
    const queue = useSerialQueue()
    sessionResets.push(() => {
      queue.reset()
      state.value = initial()
    })
    return { state, run: queue.run }
  }

  /* 与后端一样按 gid 识别进度；只存已查询到或已保存成功的页码。 */
  const { state: readingProgress, run: runReading } = accountState(() => new Map<number, number | null>())
  const { state: searchHistory, run: runSearch } = accountState<string[]>(() => [])
  /* 浏览偏好与搜索历史同属账号数据：只有一份，读写也按提交顺序排队。 */
  const { state: preferences, run: runPreference } = accountState(defaultPreferences)
  /* e 站绑定状态。未读取时为 null，界面据此区分「还没问过」和「确实没绑」。 */
  const { state: credential, run: runCredential } = accountState<ehApi.CredentialStatus | null>(() => null)

  /* 凭据变化只淘汰 EH 页面，账号级的阅读进度不因换绑 e 站账号而清空。 */
  function invalidateCache() {
    cacheRevision.value += 1
  }

  /* 详情接口包含进度，也参与读写排序；页面不再单独持有这份页码。 */
  async function loadGalleryDetail(gid: number, token: string, signal?: AbortSignal) {
    const result = await runReading(
      (requestSignal) => ehApi.fetchGalleryDetail(gid, token, requestSignal),
      (detail) => readingProgress.value.set(gid, detail.progress),
      signal,
    )
    return { gallery: result.gallery, imageUrlTemplate: result.imageUrlTemplate }
  }

  /* 列表原样交给页面显示；顺带刷新 readingProgress，是为了让详情页的「继续阅读第 N 页」跟上。 */
  function loadReadingHistory(cursor: string, signal?: AbortSignal) {
    return runReading(
      (requestSignal) => ehApi.fetchReadingHistory(cursor, requestSignal),
      (history) => {
        for (const item of history.items) {
          readingProgress.value.set(item.gid, item.page)
        }
      },
      signal,
    )
  }

  /* 计时器随 Store 存活，离开阅读器既不提前保存，也不丢弃最后报告的位置。 */
  function scheduleProgress({ gid, token, page }: ReadingPosition) {
    cancelPendingProgress(gid)
    const timer = setTimeout(() => {
      saveTimers.delete(gid)
      /* 保存失败保留上次确认的页码，不打断阅读；之后翻页仍可再次保存。 */
      void runReading(
        (signal) => ehApi.saveProgress(gid, token, page, signal),
        () => readingProgress.value.set(gid, page),
      ).catch(() => {})
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
    return runReading(
      (signal) => ehApi.removeReadingHistory(gid, signal),
      () => readingProgress.value.delete(gid),
    )
  }

  function clearReadingHistory() {
    cancelPendingSaves()
    return runReading(
      (signal) => ehApi.clearReadingHistory(signal),
      () => readingProgress.value.clear(),
    )
  }

  /* 四个接口都回整份历史，提交方式只有「整份替换」这一种。 */
  function acceptSearchHistory(entries: string[]) {
    searchHistory.value = entries
  }

  /* 搜索历史按账号顺序提交，页面退出后已排队的写入继续执行。 */
  function loadSearchHistory(signal?: AbortSignal) {
    return runSearch(ehApi.fetchSearchHistory, acceptSearchHistory, signal)
  }

  function recordSearch(keyword: string) {
    return runSearch((signal) => ehApi.recordSearch(keyword, signal), acceptSearchHistory)
  }

  function removeSearch(keyword: string) {
    return runSearch((signal) => ehApi.removeSearch(keyword, signal), acceptSearchHistory)
  }

  function clearSearchHistory(signal?: AbortSignal) {
    return runSearch(ehApi.clearSearchHistory, acceptSearchHistory, signal)
  }

  function acceptCredential(status: ehApi.CredentialStatus) {
    credential.value = status
  }

  /* 换绑或解绑都会改变能看到的内容，缓存里的图集要连同页面一起丢掉。 */
  function acceptRebind(status: ehApi.CredentialStatus) {
    acceptCredential(status)
    invalidateCache()
  }

  function loadCredential(signal?: AbortSignal) {
    return runCredential(ehApi.fetchCredentialStatus, acceptCredential, signal)
  }

  function bindCredential(cookie: ehApi.EhCookie) {
    return runCredential(() => ehApi.bindCredential(cookie), acceptRebind)
  }

  function unbindCredential() {
    return runCredential(() => ehApi.unbindCredential(), acceptRebind)
  }

  /* 每次进入页面都重新读一次：偏好可能在别的设备上改过。 */
  function loadPreferences(signal?: AbortSignal) {
    return runPreference(
      ehApi.fetchGalleryPreferences,
      (loaded) => {
        preferences.value = loaded
      },
      signal,
    )
  }

  /* 两个保存接口都是「先落到界面、再提交」：改动当场生效，保存失败也不把用户刚做的选择弹回去。
   * 成功之后无需回写——本地早就是这个值了，再写一遍反而会把排在后面的那次改动顶掉。
   */
  function saveCategories(categories: string[]) {
    const next = [...categories]
    preferences.value = { ...preferences.value, categories: next }
    return runPreference((signal) => ehApi.saveGalleryCategories(next, signal), noop)
  }

  function setReaderInterval(interval: number) {
    preferences.value = { ...preferences.value, readerInterval: interval }
  }

  function saveReaderInterval(interval: number) {
    return runPreference((signal) => ehApi.saveReaderInterval(interval, signal), noop)
  }

  function resetSessionState() {
    cancelPendingSaves()
    for (const reset of sessionResets) {
      reset()
    }
  }

  /* 队列可能比页面活得久。切换账号时取消旧会话，未发出的操作不能带着新账号令牌执行。 */
  watch([() => authStore.user?.id, () => authStore.pageRevision], resetSessionState, { flush: "sync" })
  onScopeDispose(cancelPendingSaves)

  return {
    cacheRevision,
    readingProgress,
    searchHistory,
    preferences,
    credential,
    loadCredential,
    bindCredential,
    unbindCredential,
    loadSearchHistory,
    recordSearch,
    removeSearch,
    clearSearchHistory,
    loadPreferences,
    saveCategories,
    setReaderInterval,
    saveReaderInterval,
    invalidateCache,
    loadGalleryDetail,
    loadReadingHistory,
    scheduleProgress,
    removeReadingHistory,
    clearReadingHistory,
  }
})
