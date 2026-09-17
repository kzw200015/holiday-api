import { computed, onScopeDispose, ref } from "vue"

import { useEhStore } from "@/stores/EhStore"

/** 页面持有反馈状态；账号 Store 负责历史数据和读写顺序。 */
export function useSearchHistory() {
  const store = useEhStore()
  const loading = ref(false)
  const errorMessage = ref("")
  let revision = 0
  let controller: AbortController | undefined

  async function perform(request: () => Promise<unknown>, failureMessage: string) {
    const current = ++revision
    loading.value = true
    errorMessage.value = ""
    try {
      await request()
    } catch {
      if (current === revision) {
        errorMessage.value = failureMessage
      }
    } finally {
      if (current === revision) {
        loading.value = false
      }
    }
  }

  function load() {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    return perform(() => store.loadSearchHistory(signal), "读取搜索历史失败。")
  }

  function record(keyword: string) {
    return perform(() => store.recordSearch(keyword), "搜索历史保存失败，本次关键词未确认保存。")
  }

  function remove(keyword: string) {
    return perform(() => store.removeSearch(keyword), "删除搜索历史失败，请重试。")
  }

  function clear() {
    return perform(() => store.clearSearchHistory(), "清空搜索历史失败，请重试。")
  }

  onScopeDispose(() => {
    revision += 1
    controller?.abort()
  })

  return { entries: computed(() => store.searchHistory), loading, errorMessage, load, record, remove, clear }
}
