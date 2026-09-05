import { ref } from "vue"

/* 浏览器存储可能被禁用或损坏，历史不可用不能阻断搜索。 */
export function useSearchHistory(userId: number | undefined) {
  const key = `myapi.search-history.${userId}`
  const entries = ref<string[]>([])
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]")
    if (Array.isArray(stored)) {
      entries.value = [...new Set(stored.filter((value): value is string => typeof value === "string" && !!value.trim()))].slice(0, 10)
    }
  } catch { /* 仅丢弃损坏的历史。 */ }

  function persist() {
    if (userId === undefined) return
    try { localStorage.setItem(key, JSON.stringify(entries.value)) } catch { /* 保留本次页面内的历史。 */ }
  }
  function record(keyword: string) {
    const value = keyword.trim()
    if (!value) return
    entries.value = [value, ...entries.value.filter((item) => item !== value)].slice(0, 10)
    persist()
  }
  function remove(keyword: string) {
    entries.value = entries.value.filter((item) => item !== keyword)
    persist()
  }
  function clear() {
    entries.value = []
    persist()
  }
  return { entries, record, remove, clear }
}
