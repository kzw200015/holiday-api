import { onScopeDispose, ref } from "vue"

import { clearSearchHistory, fetchSearchHistory, recordSearch, removeSearch } from "@/api/eh"

/** 搜索历史按操作提交，去重与数量上限统一由服务端负责。 */
export function useSearchHistory() {
  const entries = ref<string[]>([])
  const loading = ref(false)
  const errorMessage = ref("")
  let revision = 0
  const controller = new AbortController()

  async function update(request: () => Promise<string[]>, failureMessage: string) {
    const current = ++revision
    loading.value = true
    errorMessage.value = ""
    try {
      const history = await request()
      if (current === revision) {
        entries.value = history
      }
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
    return update(() => fetchSearchHistory(controller.signal), "读取搜索历史失败。")
  }

  function record(keyword: string) {
    keyword = keyword.trim()
    if (!keyword) {
      return
    }
    return update(() => recordSearch(keyword), "搜索历史保存失败，本次关键词未确认保存。")
  }

  function remove(keyword: string) {
    return update(() => removeSearch(keyword), "删除搜索历史失败，请重试。")
  }

  function clear() {
    return update(async () => {
      await clearSearchHistory()
      return []
    }, "清空搜索历史失败，请重试。")
  }

  onScopeDispose(() => {
    revision += 1
    controller.abort()
  })

  return { entries, loading, errorMessage, load, record, remove, clear }
}
