import { ref, type Ref } from "vue"

/**
 * 按本站账号落盘的本机偏好。浏览器存储可能被禁用、写满或被手工改坏：
 * 读不出就退回默认值，写不进只影响下次打开，都不能阻断当前页面。
 * 没有账号时只在内存里生效，不往盘上写。
 */
export function usePersistedValue<T>(name: string, userId: number | undefined, normalize: (raw: unknown) => T) {
  const key = userId === undefined ? undefined : `myapi.${name}.${userId}`
  const value = ref(normalize(undefined)) as Ref<T>
  if (key) {
    try {
      value.value = normalize(JSON.parse(localStorage.getItem(key) ?? "null"))
    } catch { /* 损坏或不可读的存储按空处理。 */ }
  }
  function set(next: T) {
    value.value = normalize(next)
    if (!key) return
    try {
      localStorage.setItem(key, JSON.stringify(value.value))
    } catch { /* 存储不可写时，当前页面仍按新值工作。 */ }
  }
  return { value, set }
}
