import { computed } from "vue"

import { useAsyncAction } from "@/composables/useAsyncAction"
import { useEhStore } from "@/stores/EhStore"

/** 页面持有反馈状态；账号 Store 负责历史数据和读写顺序。 */
export function useSearchHistory() {
  const store = useEhStore()
  /* 反复进出页面时旧的读取没必要留着，写入则一条都不能丢，所以分成两个。 */
  const loadAction = useAsyncAction({ latestOnly: true, failureMessage: "读取搜索历史失败。" })
  const writeAction = useAsyncAction()
  /* 页面上只有一处提示。写失败排在读失败前面：读取会随页面激活自动重来，写入不会。 */
  const errorMessage = computed(() => writeAction.errorMessage.value || loadAction.errorMessage.value)

  function load() {
    return loadAction.run((signal) => store.loadSearchHistory(signal))
  }

  function record(keyword: string) {
    return writeAction.run(() => store.recordSearch(keyword), {
      failureMessage: "搜索历史保存失败，本次关键词未确认保存。",
    })
  }

  function remove(keyword: string) {
    return writeAction.run(() => store.removeSearch(keyword), { failureMessage: "删除搜索历史失败，请重试。" })
  }

  function clear() {
    return writeAction.run(() => store.clearSearchHistory(), { failureMessage: "清空搜索历史失败，请重试。" })
  }

  return {
    entries: computed(() => store.searchHistory),
    loading: computed(() => loadAction.pending.value || writeAction.pending.value),
    errorMessage,
    load,
    record,
    remove,
    clear,
  }
}
