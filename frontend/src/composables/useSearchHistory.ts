import { usePersistedValue } from "@/composables/usePersistedValue"

const LIMIT = 10

/* 去空、去重、截断：读盘与记录共用同一条规则，两边才不会各自漂移。 */
function normalize(raw: unknown) {
  if (!Array.isArray(raw)) {
    return []
  }
  const values = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(values)].slice(0, LIMIT)
}

/* 按本站账号记录提交过的关键词，最近的排最前。 */
export function useSearchHistory(userId: number | undefined) {
  const { value: entries, set } = usePersistedValue("search-history", userId, normalize)
  function record(keyword: string) {
    if (keyword.trim()) {
      set([keyword, ...entries.value])
    }
  }
  function remove(keyword: string) {
    set(entries.value.filter((item) => item !== keyword))
  }
  function clear() {
    set([])
  }
  return { entries, record, remove, clear }
}
